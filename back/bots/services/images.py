"""Shared image upload helpers (S3-backed).

Chat message photos and profile photos share the same pipeline: validate,
downscale to a max 800px box, convert to JPEG, and store under a random
UUID key. Serializers expose short-lived presigned read URLs; the DB only
stores the S3 key (`*_filename`).
"""
import io
import uuid

import boto3
from django.conf import settings
from PIL import Image
from rest_framework.exceptions import ValidationError

ALLOWED_PHOTO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_PHOTO_BYTES = 20 * 1024 * 1024


def validate_uploaded_photo(uploaded_file):
    """Return an error string when the upload is rejected, else None."""
    if uploaded_file is None:
        return 'No image file provided'
    if uploaded_file.size > MAX_PHOTO_BYTES:
        return 'File size exceeds 20MB limit'
    name = uploaded_file.name or ''
    if '.' not in name or name.rsplit('.', 1)[1].lower() not in ALLOWED_PHOTO_EXTENSIONS:
        return 'Invalid file type'
    return None


def compress_and_upload_image(uploaded_file):
    try:
        image = Image.open(uploaded_file)
        image.thumbnail((800, 800))
        if image.mode != 'RGB':
            image = image.convert('RGB')
        buffered = io.BytesIO()
        image.save(buffered, format='JPEG', quality=85)
        data = buffered.getvalue()
        filename = f'{uuid.uuid4()!s}.jpg'
        boto3.client('s3').upload_fileobj(
            io.BytesIO(data), settings.AWS_STORAGE_BUCKET_NAME, Key=filename)
        return filename
    except Exception as e:
        raise ValueError(f'Unable to upload image: {e!s}')


def presigned_photo_url(filename, expires_in=3600):
    if not filename:
        return None
    s3 = boto3.client('s3')
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.AWS_STORAGE_BUCKET_NAME, 'Key': filename},
        ExpiresIn=expires_in)


def upload_validated_photo(uploaded_file):
    """Validate then upload; raise DRF ValidationError keyed `photo` on reject."""
    error = validate_uploaded_photo(uploaded_file)
    if error:
        raise ValidationError({'photo': error})
    try:
        return compress_and_upload_image(uploaded_file)
    except ValidationError:
        raise
    except ValueError as e:
        raise ValidationError({'photo': str(e) or 'Unable to upload image'})
