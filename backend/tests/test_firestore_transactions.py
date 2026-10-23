import asyncio
from copy import deepcopy

from google.cloud import firestore

from firestore_store import FirestoreCollection


class FakeSnapshot:
    exists = True

    def __init__(self, document):
        self.document = deepcopy(document)

    def to_dict(self):
        return deepcopy(self.document)


class FakeTransaction:
    def __init__(self):
        self.started = False
        self.committed = False
        self.writes = []

    def begin(self):
        self.started = True

    def set(self, document_ref, value):
        assert self.started
        self.writes.append((document_ref, deepcopy(value)))

    def commit(self):
        assert self.started
        self.committed = True


class FakeClient:
    def __init__(self):
        self.transaction_instance = FakeTransaction()
        self.max_attempts = None

    def transaction(self, max_attempts=5):
        self.max_attempts = max_attempts
        return self.transaction_instance


class FakeDocumentReference:
    def __init__(self, client, document):
        self._client = client
        self.document = deepcopy(document)

    def get(self, transaction=None):
        assert transaction is not None and transaction.started, (
            "Firestore reads must run inside a started transaction"
        )
        return FakeSnapshot(self.document)


class FakeCollectionReference:
    def __init__(self, client, document):
        self._client = client
        self.reference = FakeDocumentReference(client, document)
        self.requested_document_id = None

    def document(self, document_id):
        self.requested_document_id = document_id
        return self.reference


def test_find_one_and_update_starts_transaction_before_read(monkeypatch):
    client = FakeClient()
    collection_ref = FakeCollectionReference(client, {"id": "product-1", "stock": 5})

    def transactional(callback):
        def run(transaction):
            transaction.begin()
            result = callback(transaction)
            transaction.commit()
            return result

        return run

    monkeypatch.setattr(firestore, "transactional", transactional)
    collection = FirestoreCollection(collection_ref)

    result = asyncio.run(collection.find_one_and_update(
        {"id": "product-1", "stock": {"$gte": 2}},
        {"$inc": {"stock": -2}},
    ))

    assert collection_ref.requested_document_id == "product-1"
    assert client.max_attempts == 3
    assert client.transaction_instance.committed is True
    assert result == {"id": "product-1", "stock": 3}
    assert client.transaction_instance.writes == [(collection_ref.reference, result)]
