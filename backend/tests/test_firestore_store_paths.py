import copy
import hashlib
import unittest

from firestore_store import FirestoreCollection, favorite_document_id


class FakeDocumentReference:
    def __init__(self, collection, document_id):
        self.collection = collection
        self.document_id = document_id

    def set(self, document):
        self.collection.writes[self.document_id] = copy.deepcopy(document)


class FakeCollectionReference:
    def __init__(self):
        self.writes = {}

    def document(self, document_id):
        if "/" in document_id:
            raise ValueError("A document must have an even number of path elements")
        return FakeDocumentReference(self, document_id)


class FirestoreDocumentIdTests(unittest.IsolatedAsyncioTestCase):
    async def test_cloudinary_public_id_path_is_a_stable_single_segment_id(self):
        path = "souq-market/uploads/manager-id/asset-id"
        collection_ref = FakeCollectionReference()
        collection = FirestoreCollection(collection_ref)
        upload_record = {"path": path, "public_id": path, "provider": "cloudinary"}

        result = await collection.insert_one(upload_record)

        expected_id = "path_" + hashlib.sha256(f"path:{path}".encode("utf-8")).hexdigest()
        self.assertEqual(result.inserted_id, expected_id)
        self.assertNotIn("/", result.inserted_id)
        self.assertEqual(collection._document_id(upload_record), expected_id)
        self.assertEqual(collection_ref.writes, {expected_id: upload_record})


    async def test_favorites_use_stable_ids_for_each_user_and_product(self):
        collection_ref = FakeCollectionReference()
        collection = FirestoreCollection(collection_ref)
        user_id = "customer-1"
        product_ids = ["product-1", "product-2"]
        favorite_ids = [favorite_document_id(user_id, product_id) for product_id in product_ids]

        self.assertEqual(favorite_ids[0], favorite_document_id(user_id, product_ids[0]))
        self.assertNotEqual(favorite_ids[0], favorite_ids[1])
        self.assertNotEqual(favorite_ids[0], favorite_document_id("customer-2", product_ids[0]))

        for product_id, favorite_id in zip(product_ids, favorite_ids):
            await collection.insert_one({"id": favorite_id, "user_id": user_id, "product_id": product_id})

        self.assertEqual(set(collection_ref.writes), set(favorite_ids))
        self.assertEqual(len(collection_ref.writes), 2)

if __name__ == "__main__":
    unittest.main()
