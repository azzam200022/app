"""Server-side image uploads to Cloudinary."""

from __future__ import annotations

import os
from urllib.parse import quote, unquote, urlparse

import requests


class CloudinaryStorageError(RuntimeError):
    """A Cloudinary upload failed without exposing account credentials."""


class CloudinaryConfigurationError(CloudinaryStorageError):
    """Cloudinary credentials are missing or malformed."""


def _credentials() -> tuple[str, str, str]:
    cloudinary_url = os.environ.get("CLOUDINARY_URL", "").strip()
    if cloudinary_url:
        try:
            parsed = urlparse(cloudinary_url)
            cloud_name = parsed.hostname
            api_key = unquote(parsed.username or "")
            api_secret = unquote(parsed.password or "")
        except ValueError as exc:
            raise CloudinaryConfigurationError("CLOUDINARY_URL is invalid.") from exc

        if parsed.scheme.lower() != "cloudinary" or not cloud_name or not api_key or not api_secret:
            raise CloudinaryConfigurationError("CLOUDINARY_URL is invalid.")
    else:
        cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
        api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
        api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()

        if not cloud_name or not api_key or not api_secret:
            raise CloudinaryConfigurationError(
                "Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
            )

    return cloud_name, api_key, api_secret


def is_cloudinary_configured() -> bool:
    """Report whether credentials are present, without exposing their values."""
    try:
        _credentials()
    except CloudinaryConfigurationError:
        return False
    return True


def upload_image_bytes(path: str, data: bytes, content_type: str) -> dict:
    """Upload image bytes with server-side Basic Auth and return safe asset metadata."""
    if not data:
        raise CloudinaryStorageError("The image is empty.")
    if not content_type.startswith("image/"):
        raise CloudinaryStorageError("The uploaded file is not an image.")

    cloud_name, api_key, api_secret = _credentials()
    filename = path.rsplit("/", 1)[-1]
    public_id = path.rsplit(".", 1)[0] if "." in filename else path
    endpoint = f"https://api.cloudinary.com/v1_1/{quote(cloud_name, safe='')}/image/upload"

    try:
        response = requests.post(
            endpoint,
            data={"public_id": public_id},
            files={"file": (filename, data, content_type)},
            auth=(api_key, api_secret),
            timeout=(10, 60),
        )
    except requests.RequestException as exc:
        raise CloudinaryStorageError("Could not reach Cloudinary.") from exc

    if response.status_code != 200:
        raise CloudinaryStorageError(
            f"Cloudinary rejected the image upload (HTTP {response.status_code})."
        )

    try:
        result = response.json()
    except ValueError as exc:
        raise CloudinaryStorageError("Cloudinary returned an invalid response.") from exc

    if not isinstance(result, dict):
        raise CloudinaryStorageError("Cloudinary returned an invalid response.")

    secure_url = result.get("secure_url")
    uploaded_public_id = result.get("public_id")
    if not secure_url or not uploaded_public_id:
        raise CloudinaryStorageError("Cloudinary response did not include the uploaded asset.")

    return {
        "path": uploaded_public_id,
        "url": secure_url,
        "public_id": uploaded_public_id,
        "format": result.get("format"),
        "width": result.get("width"),
        "height": result.get("height"),
        "bytes": result.get("bytes"),
    }
