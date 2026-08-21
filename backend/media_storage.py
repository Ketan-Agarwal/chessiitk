import os
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import unquote


IMAGE_EXTENSIONS = {
    "PNG": "png",
    "JPEG": "jpg",
    "WEBP": "webp",
    "GIF": "gif",
}
IMAGE_MIME_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
}
MAX_IMAGE_PIXELS = 25_000_000


class MediaConfigurationError(RuntimeError):
    pass


class InvalidImageError(ValueError):
    pass


def _validated_extension(upload):
    from PIL import Image, UnidentifiedImageError

    try:
        upload.stream.seek(0)
        with Image.open(upload.stream) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise InvalidImageError("The uploaded image dimensions are too large.")
            image.verify()
            extension = IMAGE_EXTENSIONS.get(image.format)
    except (UnidentifiedImageError, OSError, ValueError):
        raise InvalidImageError("The uploaded file is not a supported image.") from None
    finally:
        upload.stream.seek(0)

    if not extension:
        raise InvalidImageError("Supported image formats are PNG, JPEG, WEBP, and GIF.")
    return extension


def _local_upload_directory():
    configured = os.environ.get("MEDIA_LOCAL_DIRECTORY")
    if configured:
        return Path(configured).resolve()
    return (Path(__file__).resolve().parent / "static" / "uploads").resolve()


def _gcs_public_base(bucket_name):
    return os.environ.get(
        "GCS_PUBLIC_BASE_URL",
        f"https://storage.googleapis.com/{bucket_name}",
    ).rstrip("/")


def save_uploaded_image(upload):
    extension = _validated_extension(upload)
    filename = f"{uuid.uuid4().hex}.{extension}"
    backend = os.environ.get("MEDIA_STORAGE_BACKEND", "gcs").strip().lower()

    if backend == "local":
        upload_directory = _local_upload_directory()
        upload_directory.mkdir(parents=True, exist_ok=True)
        upload.save(upload_directory / filename)
        return f"/static/uploads/{filename}"

    if backend != "gcs":
        raise MediaConfigurationError("MEDIA_STORAGE_BACKEND must be 'gcs' or 'local'.")

    bucket_name = (os.environ.get("GCS_UPLOAD_BUCKET") or "").strip()
    if not bucket_name:
        raise MediaConfigurationError("GCS_UPLOAD_BUCKET must be configured for production uploads.")

    from google.cloud import storage

    object_name = f"uploads/{filename}"
    client = storage.Client()
    blob = client.bucket(bucket_name).blob(object_name)
    blob.upload_from_file(upload.stream, content_type=IMAGE_MIME_TYPES[extension], rewind=True)
    return f"{_gcs_public_base(bucket_name)}/{object_name}"


def _gcs_object_name(image_url, bucket_name):
    prefix = f"{_gcs_public_base(bucket_name)}/"
    if not isinstance(image_url, str) or not image_url.startswith(prefix):
        return None
    object_name = unquote(image_url[len(prefix):])
    path = PurePosixPath(object_name)
    if path.is_absolute() or ".." in path.parts or not object_name.startswith("uploads/"):
        return None
    return object_name


def delete_uploaded_image(image_url):
    backend = os.environ.get("MEDIA_STORAGE_BACKEND", "gcs").strip().lower()
    if backend == "local":
        prefix = "/static/uploads/"
        if not isinstance(image_url, str) or not image_url.startswith(prefix):
            return False
        filename = image_url[len(prefix):]
        if not filename or Path(filename).name != filename:
            return False
        path = (_local_upload_directory() / filename).resolve()
        if path.parent != _local_upload_directory():
            return False
        if path.is_file():
            path.unlink()
        return True

    if backend != "gcs":
        raise MediaConfigurationError("MEDIA_STORAGE_BACKEND must be 'gcs' or 'local'.")

    bucket_name = (os.environ.get("GCS_UPLOAD_BUCKET") or "").strip()
    if not bucket_name:
        raise MediaConfigurationError("GCS_UPLOAD_BUCKET must be configured for production uploads.")
    object_name = _gcs_object_name(image_url, bucket_name)
    if not object_name:
        return False

    from google.cloud import storage

    storage.Client().bucket(bucket_name).blob(object_name).delete()
    return True
