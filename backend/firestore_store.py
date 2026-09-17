"""Async-shaped Firestore adapter used by the API.

The API keeps a small Mongo-style surface, but reads are pushed down to
Firestore whenever the filter can be represented by a Firestore query.  The
old adapter streamed every document and filtered in Python, which made every
screen request scale with the size of the collection.
"""

from copy import deepcopy
import asyncio
import logging
import re
import uuid

logger = logging.getLogger(__name__)


def _value(document, field):
    current = document
    for part in field.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _set_value(document, field, value):
    parts = field.split(".")
    current = document
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = deepcopy(value)


def _matches(document, query):
    for field, expected in (query or {}).items():
        actual = _value(document, field)
        if isinstance(expected, dict):
            options = expected.get("$options", "")
            for operator, operand in expected.items():
                if operator == "$options":
                    continue
                if operator == "$in":
                    if isinstance(actual, list):
                        if not any(item in operand for item in actual):
                            return False
                    elif actual not in operand:
                        return False
                elif operator == "$nin":
                    if isinstance(actual, list):
                        if any(item in operand for item in actual):
                            return False
                    elif actual in operand:
                        return False
                elif operator == "$ne" and actual == operand:
                    return False
                elif operator == "$gt" and not (actual is not None and actual > operand):
                    return False
                elif operator == "$gte" and not (actual is not None and actual >= operand):
                    return False
                elif operator == "$lt" and not (actual is not None and actual < operand):
                    return False
                elif operator == "$lte" and not (actual is not None and actual <= operand):
                    return False
                elif operator == "$regex":
                    if actual is None or re.search(
                        str(operand), str(actual), re.I if "i" in options else 0
                    ) is None:
                        return False
        elif expected is None:
            if actual is not None:
                return False
        elif actual != expected:
            return False
    return True


def _project(document, projection):
    output = deepcopy(document)
    if not projection:
        return output
    fields = {key: value for key, value in projection.items() if key != "_id"}
    includes = any(value for value in fields.values())
    if includes:
        output = {
            key: deepcopy(document[key])
            for key, value in fields.items()
            if value and key in document
        }
    else:
        for key, value in fields.items():
            if not value:
                output.pop(key, None)
    return output


class FirestoreResult:
    def __init__(self, **values):
        self.__dict__.update(values)


class FirestoreCursor:
    def __init__(
        self,
        documents=None,
        query=None,
        collection=None,
        matcher=None,
        projection=None,
        loader=None,
    ):
        self.documents = documents
        self.query = query
        self.collection = collection
        self.matcher = matcher
        self.projection = projection
        self.loader = loader
        self.sorts = []
        self.amount = None

    def sort(self, field, direction=1):
        self.sorts.append((field, direction))
        if self.query is not None:
            try:
                from google.cloud.firestore_v1 import Query

                self.query = self.query.order_by(
                    field,
                    direction=Query.ASCENDING if direction >= 0 else Query.DESCENDING,
                )
            except Exception:
                # A missing composite index is handled by the safe fallback in
                # to_list(), which still applies the same sort in memory.
                self.query = None
        elif self.documents is not None:
            self.documents.sort(
                key=lambda item: (_value(item, field) is None, _value(item, field)),
                reverse=direction < 0,
            )
        return self

    def limit(self, amount):
        self.amount = amount
        if self.query is not None:
            self.query = self.query.limit(amount)
        elif self.documents is not None:
            self.documents = self.documents[:amount]
        return self

    async def to_list(self, length=None):
        requested = length if length is not None else self.amount
        if self.documents is not None:
            documents = deepcopy(self.documents)
        elif self.loader is not None:
            documents = await asyncio.to_thread(self.loader)
        elif self.query is not None:
            try:
                documents = await asyncio.to_thread(self.collection._stream_query, self.query)
            except Exception as exc:
                logger.warning("Firestore query fallback activated: %s", exc)
                documents = await asyncio.to_thread(self.collection._stream_all)
                if self.matcher:
                    documents = [doc for doc in documents if self.matcher(doc)]
                for field, direction in self.sorts:
                    documents.sort(
                        key=lambda item: (_value(item, field) is None, _value(item, field)),
                        reverse=direction < 0,
                    )
        elif self.collection is not None:
            documents = await asyncio.to_thread(self.collection._stream_all)
            if self.matcher:
                documents = [doc for doc in documents if self.matcher(doc)]
            for field, direction in self.sorts:
                documents.sort(
                    key=lambda item: (_value(item, field) is None, _value(item, field)),
                    reverse=direction < 0,
                )
        else:
            documents = []

        if self.projection:
            documents = [_project(doc, self.projection) for doc in documents]
        if requested is not None:
            documents = documents[:requested]
        return deepcopy(documents)


class FirestoreCollection:
    def __init__(self, reference):
        self.reference = reference

    def _stream_all(self):
        if self.reference is None:
            raise RuntimeError("Firestore is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON.")
        return [snapshot.to_dict() or {} for snapshot in self.reference.stream()]

    def _stream_query(self, query):
        return [snapshot.to_dict() or {} for snapshot in query.stream()]

    @staticmethod
    def _where(query, field, operator, value):
        try:
            from google.cloud.firestore_v1 import FieldFilter

            return query.where(filter=FieldFilter(field, operator, value))
        except (ImportError, TypeError):
            return query.where(field, operator, value)

    def find(self, query=None, projection=None):
        query = query or {}
        if self.reference is None:
            raise RuntimeError("Firestore is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON.")

        firestore_query = self.reference
        supported = True
        try:
            for field, expected in query.items():
                if isinstance(expected, dict):
                    if "$options" in expected or "$regex" in expected:
                        supported = False
                        break
                    for operator, operand in expected.items():
                        if operator == "$in" and len(operand) > 30:
                            supported = False
                            break
                        firestore_operator = {
                            "$in": "in",
                            "$nin": "not-in",
                            "$ne": "!=",
                            "$gt": ">",
                            "$gte": ">=",
                            "$lt": "<",
                            "$lte": "<=",
                        }.get(operator)
                        if not firestore_operator:
                            supported = False
                            break
                        firestore_query = self._where(
                            firestore_query, field, firestore_operator, operand
                        )
                    if not supported:
                        break
                else:
                    firestore_query = self._where(firestore_query, field, "==", expected)
        except Exception:
            supported = False

        if supported and projection:
            fields = [key for key, value in projection.items() if key != "_id" and value]
            if fields and all(value for key, value in projection.items() if key != "_id"):
                try:
                    firestore_query = firestore_query.select(fields)
                except Exception:
                    supported = False

        return FirestoreCursor(
            query=firestore_query if supported else None,
            collection=self if supported else None,
            matcher=(lambda document: _matches(document, query)),
            projection=projection,
            documents=None,
            loader=None if supported else lambda: [
                _project(doc, projection)
                for doc in self._stream_all()
                if _matches(doc, query)
            ],
        )

    async def find_one(self, query=None, projection=None):
        items = await self.find(query, projection).limit(1).to_list(1)
        return items[0] if items else None

    def _document_id(self, document):
        for key in ("id", "user_id", "session_token", "key", "barcode", "path"):
            value = document.get(key)
            if value:
                return str(value)
        return uuid.uuid4().hex

    async def insert_one(self, document):
        item = deepcopy(document)
        document_id = self._document_id(item)

        def write():
            self.reference.document(document_id).set(item)

        await asyncio.to_thread(write)
        return FirestoreResult(inserted_id=document_id)

    async def insert_many(self, documents):
        items = [deepcopy(document) for document in documents]
        ids = [self._document_id(document) for document in items]

        def write_batches():
            client = self.reference._client
            for start in range(0, len(items), 400):
                batch = client.batch()
                for document_id, item in zip(ids[start : start + 400], items[start : start + 400]):
                    batch.set(self.reference.document(document_id), item)
                batch.commit()

        if items:
            await asyncio.to_thread(write_batches)
        return FirestoreResult(inserted_ids=ids)

    def _update_document(self, document, update):
        item = deepcopy(document)
        for operator, values in update.items():
            if operator == "$set":
                for field, value in values.items():
                    _set_value(item, field, value)
            elif operator == "$push":
                for field, value in values.items():
                    item.setdefault(field, []).append(deepcopy(value))
            elif operator == "$pull":
                for field, value in values.items():
                    item[field] = [
                        entry
                        for entry in item.get(field, [])
                        if not _matches(entry, value if isinstance(value, dict) else {field: value})
                    ]
        return item

    async def update_one(self, query, update, upsert=False):
        snapshot = await self.find_one(query)
        if snapshot is None:
            if not upsert:
                return FirestoreResult(matched_count=0, modified_count=0)
            snapshot = {
                key: value for key, value in query.items() if not isinstance(value, dict)
            }
            snapshot = self._update_document(snapshot, update)
            await self.insert_one(snapshot)
            return FirestoreResult(
                matched_count=0,
                modified_count=1,
                upserted_id=self._document_id(snapshot),
            )
        updated = self._update_document(snapshot, update)
        document_id = self._document_id(snapshot)
        await asyncio.to_thread(self.reference.document(document_id).set, updated)
        return FirestoreResult(matched_count=1, modified_count=1)

    async def find_one_and_update(self, query, update):
        """Atomically update a document when it still matches the claim query."""
        if not self.reference:
            return None
        document_id = next(
            (
                query.get(key)
                for key in ("id", "user_id", "session_token", "key", "barcode", "path")
                if query.get(key)
            ),
            None,
        )
        if not document_id:
            return None

        def commit_claim():
            client = getattr(self.reference, "_client", None)
            if not client:
                return None
            document_ref = self.reference.document(str(document_id))
            for attempt in range(3):
                transaction = client.transaction()
                snapshot = document_ref.get(transaction=transaction)
                if not snapshot.exists:
                    return None
                current = snapshot.to_dict() or {}
                if not _matches(current, query):
                    return None
                updated = self._update_document(current, update)
                transaction.set(document_ref, updated)
                try:
                    transaction.commit()
                    return updated
                except Exception:
                    if attempt == 2:
                        raise
            return None

        return await asyncio.to_thread(commit_claim)

    async def update_many(self, query, update):
        documents = await self.find(query).to_list(None)
        updated = [(self._document_id(doc), self._update_document(doc, update)) for doc in documents]

        def write_batches():
            client = self.reference._client
            for start in range(0, len(updated), 400):
                batch = client.batch()
                for document_id, item in updated[start : start + 400]:
                    batch.set(self.reference.document(document_id), item)
                batch.commit()

        if updated:
            await asyncio.to_thread(write_batches)
        return FirestoreResult(matched_count=len(updated), modified_count=len(updated))

    async def delete_one(self, query):
        document = await self.find_one(query)
        if not document:
            return FirestoreResult(deleted_count=0)
        await asyncio.to_thread(self.reference.document(self._document_id(document)).delete)
        return FirestoreResult(deleted_count=1)

    async def delete_many(self, query):
        documents = await self.find(query).to_list(None)
        ids = [self._document_id(document) for document in documents]

        def delete_batches():
            client = self.reference._client
            for start in range(0, len(ids), 400):
                batch = client.batch()
                for document_id in ids[start : start + 400]:
                    batch.delete(self.reference.document(document_id))
                batch.commit()

        if ids:
            await asyncio.to_thread(delete_batches)
        return FirestoreResult(deleted_count=len(ids))

    async def count_documents(self, query=None):
        return len(await self.find(query).to_list(None))

    def aggregate(self, pipeline):
        def compute():
            documents = self._stream_all()
            for stage in pipeline:
                if "$match" in stage:
                    documents = [doc for doc in documents if _matches(doc, stage["$match"])]
                elif "$unwind" in stage:
                    field = stage["$unwind"].lstrip("$")
                    expanded = []
                    for doc in documents:
                        values = _value(doc, field) or []
                        for value in values:
                            item = deepcopy(doc)
                            _set_value(item, field, value)
                            expanded.append(item)
                    documents = expanded
                elif "$group" in stage:
                    definition = stage["$group"]
                    groups = {}
                    for doc in documents:
                        group_key = definition.get("_id")
                        if isinstance(group_key, str) and group_key.startswith("$"):
                            group_key = _value(doc, group_key[1:])
                        bucket = groups.setdefault(str(group_key), {"_id": group_key})
                        for name, expression in definition.items():
                            if name == "_id":
                                continue
                            if "$sum" in expression:
                                operand = expression["$sum"]
                                value = (
                                    operand
                                    if isinstance(operand, (int, float))
                                    else (_value(doc, operand.lstrip("$")) or 0)
                                )
                                bucket[name] = bucket.get(name, 0) + value
                    documents = list(groups.values())
                elif "$sort" in stage:
                    for field, direction in reversed(list(stage["$sort"].items())):
                        documents.sort(
                            key=lambda item: (_value(item, field) is None, _value(item, field)),
                            reverse=direction < 0,
                        )
                elif "$limit" in stage:
                    documents = documents[: stage["$limit"]]
            return documents

        return FirestoreCursor(loader=compute)

    async def create_index(self, *args, **kwargs):
        # Firestore indexes are managed by firestore.indexes.json / Firebase.
        return None


class FirestoreDatabase:
    def __init__(self, client):
        self.client = client

    def __getattr__(self, name):
        return FirestoreCollection(self.client.collection(name) if self.client else None)