import os
import sys
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from media_storage import InvalidImageError, _gcs_object_name, delete_uploaded_image, save_uploaded_image


class MemoryUpload:
    def __init__(self, data, mimetype="application/octet-stream"):
        self.stream = BytesIO(data)
        self.mimetype = mimetype

    def save(self, destination):
        Path(destination).write_bytes(self.stream.read())


class MediaStorageTests(unittest.TestCase):
    def test_image_bytes_determine_safe_extension(self):
        image_data = BytesIO()
        Image.new("RGB", (2, 2), "white").save(image_data, format="PNG")
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"MEDIA_STORAGE_BACKEND": "local", "MEDIA_LOCAL_DIRECTORY": directory},
            clear=True,
        ):
            image_url = save_uploaded_image(MemoryUpload(image_data.getvalue(), "text/html"))
            self.assertTrue(image_url.endswith(".png"))
            self.assertTrue((Path(directory) / Path(image_url).name).is_file())

    def test_non_image_payload_is_rejected(self):
        with self.assertRaises(InvalidImageError):
            save_uploaded_image(MemoryUpload(b"<script>alert(1)</script>", "image/png"))

    def test_gcs_delete_scope_rejects_foreign_and_traversal_urls(self):
        with patch.dict(
            os.environ,
            {"GCS_PUBLIC_BASE_URL": "https://media.example", "GCS_UPLOAD_BUCKET": "bucket"},
            clear=True,
        ):
            self.assertEqual(
                _gcs_object_name("https://media.example/uploads/image.jpg", "bucket"),
                "uploads/image.jpg",
            )
            self.assertIsNone(_gcs_object_name("https://attacker.example/uploads/image.jpg", "bucket"))
            self.assertIsNone(_gcs_object_name("https://media.example/uploads/../secret", "bucket"))

    def test_local_delete_is_confined_to_upload_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            upload_directory = Path(directory) / "uploads"
            upload_directory.mkdir()
            image = upload_directory / "image.jpg"
            image.write_bytes(b"fixture")
            with patch.dict(
                os.environ,
                {"MEDIA_STORAGE_BACKEND": "local", "MEDIA_LOCAL_DIRECTORY": str(upload_directory)},
                clear=True,
            ):
                self.assertFalse(delete_uploaded_image("/static/uploads/../secret"))
                self.assertTrue(delete_uploaded_image("/static/uploads/image.jpg"))
                self.assertFalse(image.exists())


if __name__ == "__main__":
    unittest.main()
