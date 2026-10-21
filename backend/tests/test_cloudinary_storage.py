import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

try:
    import requests  # noqa: F401
except ModuleNotFoundError:
    requests_stub = types.ModuleType("requests")

    class RequestException(Exception):
        pass

    requests_stub.RequestException = RequestException
    requests_stub.post = None
    sys.modules["requests"] = requests_stub

from cloudinary_storage import (
    CloudinaryConfigurationError,
    CloudinaryStorageError,
    is_cloudinary_configured,
    upload_image_bytes,
)


class CloudinaryStorageTests(unittest.TestCase):
    def test_upload_uses_server_credentials_and_returns_cloudinary_metadata(self):
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/sample.png",
            "public_id": "souq-market/uploads/user/sample",
            "format": "png",
            "width": 32,
            "height": 24,
            "bytes": 512,
        }

        with patch.dict(
            os.environ,
            {"CLOUDINARY_URL": "cloudinary://test-key:test-secret@test-cloud"},
            clear=True,
        ), patch("cloudinary_storage.requests.post", return_value=response) as post:
            result = upload_image_bytes(
                "souq-market/uploads/user/sample.png",
                b"image-bytes",
                "image/png",
            )

        self.assertEqual(result["url"], response.json.return_value["secure_url"])
        self.assertEqual(result["public_id"], response.json.return_value["public_id"])
        self.assertEqual(result["width"], 32)
        self.assertEqual(result["height"], 24)

        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs["auth"], ("test-key", "test-secret"))
        self.assertEqual(kwargs["data"], {"public_id": "souq-market/uploads/user/sample"})
        self.assertEqual(kwargs["files"]["file"][2], "image/png")
        self.assertNotIn("test-secret", kwargs["data"].__repr__())

    def test_supports_separate_cloudinary_environment_variables(self):
        values = {
            "CLOUDINARY_CLOUD_NAME": "test-cloud",
            "CLOUDINARY_API_KEY": "test-key",
            "CLOUDINARY_API_SECRET": "test-secret",
        }
        with patch.dict(os.environ, values, clear=True):
            self.assertTrue(is_cloudinary_configured())

    def test_missing_credentials_are_reported_without_attempting_upload(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(is_cloudinary_configured())
            with self.assertRaises(CloudinaryConfigurationError):
                upload_image_bytes("folder/image.jpg", b"image-bytes", "image/jpeg")

    def test_cloudinary_http_error_does_not_return_a_fake_success(self):
        response = Mock()
        response.status_code = 401

        with patch.dict(
            os.environ,
            {"CLOUDINARY_URL": "cloudinary://test-key:test-secret@test-cloud"},
            clear=True,
        ), patch("cloudinary_storage.requests.post", return_value=response):
            with self.assertRaises(CloudinaryStorageError):
                upload_image_bytes("folder/image.jpg", b"image-bytes", "image/jpeg")

    def test_invalid_cloudinary_response_is_not_returned_as_success(self):
        response = Mock()
        response.status_code = 200
        response.json.return_value = []

        with patch.dict(
            os.environ,
            {"CLOUDINARY_URL": "cloudinary://test-key:test-secret@test-cloud"},
            clear=True,
        ), patch("cloudinary_storage.requests.post", return_value=response):
            with self.assertRaises(CloudinaryStorageError):
                upload_image_bytes("folder/image.jpg", b"image-bytes", "image/jpeg")


if __name__ == "__main__":
    unittest.main()
