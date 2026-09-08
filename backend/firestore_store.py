"""Small async-shaped Firestore adapter for the existing Mongo-style API code.

The API was originally written against Motor.  This adapter intentionally keeps
the collection methods used by server.py (find, update, aggregate, and so on)
so the HTTP contract does not change while storage moves to Firestore.
"""

from copy import deepcopy
import re
import uuid


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
                    if actual is None or re.search(str(operand), str(actual), re.I if "i" in options else 0) is None:
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
        output = {key: deepcopy(document[key]) for key, value in fields.items() if value and key in document}
    else:
        for key, value in fields.items():
            if not value:
                output.pop(key, None)
    return output


class FirestoreResult:
    def __init__(self, **values):
        self.__dict__.update(values)


class FirestoreCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, field, direction=1):
        self.documents.sort(key=lambda item: (_value(item, field) is None, _value(item, field)), reverse=direction < 0)
        return self

    def limit(self, amount):
        self.documents = self.documents[:amount]
        return self

    async def to_list(self, length=None):
        return deepcopy(self.documents if length is None else self.documents[:length])


class FirestoreCollection:
    def __init__(self, reference):
        self.reference = reference

    def _all(self):
        if self.reference is None:
            raise RuntimeError("Firestore is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON.")
        return [snapshot.to_dict() or {} for snapshot in self.reference.stream()]

    def find(self, query=None, projection=None):
        return FirestoreCursor([_project(doc, projection) for doc in self._all() if _matches(doc, query or {})])

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
        self.reference.document(document_id).set(item)
        return FirestoreResult(inserted_id=document_id)

    async def insert_many(self, documents):
        for document in documents:
            await self.insert_one(document)
        return FirestoreResult(inserted_ids=[self._document_id(document) for document in documents])

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
                    item[field] = [entry for entry in item.get(field, []) if not _matches(entry, value if isinstance(value, dict) else {field: value})]
        return item

    async def update_one(self, query, update, upsert=False):
        snapshot = await self.find_one(query)
        if snapshot is None:
            if not upsert:
                return FirestoreResult(matched_count=0, modified_count=0)
            snapshot = {key: value for key, value in query.items() if not isinstance(value, dict)}
            snapshot = self._update_document(snapshot, update)
            await self.insert_one(snapshot)
            return FirestoreResult(matched_count=0, modified_count=1, upserted_id=self._document_id(snapshot))
        updated = self._update_document(snapshot, update)
        self.reference.document(self._document_id(snapshot)).set(updated)
        return FirestoreResult(matched_count=1, modified_count=1)

    async def update_many(self, query, update):
        documents = [doc for doc in self._all() if _matches(doc, query or {})]
        for document in documents:
            updated = self._update_document(document, update)
            self.reference.document(self._document_id(document)).set(updated)
        return FirestoreResult(matched_count=len(documents), modified_count=len(documents))

    async def delete_one(self, query):
        document = await self.find_one(query)
        if not document:
            return FirestoreResult(deleted_count=0)
        self.reference.document(self._document_id(document)).delete()
        return FirestoreResult(deleted_count=1)

    async def delete_many(self, query):
        documents = [doc for doc in self._all() if _matches(doc, query or {})]
        for document in documents:
            self.reference.document(self._document_id(document)).delete()
        return FirestoreResult(deleted_count=len(documents))

    async def count_documents(self, query=None):
        return len([doc for doc in self._all() if _matches(doc, query or {})])

    def aggregate(self, pipeline):
        documents = self._all()
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
                            value = operand if isinstance(operand, (int, float)) else (_value(doc, operand.lstrip("$")) or 0)
                            bucket[name] = bucket.get(name, 0) + value
                documents = list(groups.values())
            elif "$sort" in stage:
                for field, direction in reversed(list(stage["$sort"].items())):
                    documents.sort(key=lambda item: (_value(item, field) is None, _value(item, field)), reverse=direction < 0)
            elif "$limit" in stage:
                documents = documents[:stage["$limit"]]
        return FirestoreCursor(documents)

    async def create_index(self, *args, **kwargs):
        return None


class FirestoreDatabase:
    def __init__(self, client):
        self.client = client

    def __getattr__(self, name):
        return FirestoreCollection(self.client.collection(name) if self.client else None)