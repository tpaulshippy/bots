"""Profile photos: upload a picture per student so avatars can show a face
instead of the first-letter initial."""
import io
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image as PilImage
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Profile
from bots.tokens import SyftRefreshToken


def make_png(name='face.png'):
    buffer = io.BytesIO()
    PilImage.new('RGB', (10, 10), color='red').save(buffer, format='PNG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/png')


def fake_s3():
    s3 = MagicMock()
    s3.generate_presigned_url.side_effect = (
        lambda op, Params, ExpiresIn: f"https://photos.test/{Params['Key']}")
    return s3


@pytest.fixture
def parent(db):
    return User.objects.create_user(
        username='parent', email='parent@example.com', password='pass')


@pytest.fixture
def profile(parent):
    return Profile.objects.create(user=parent, name='Maya')


def parent_client(parent):
    client = APIClient()
    refresh = RefreshToken.for_user(parent)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def teen_client(profile):
    client = APIClient()
    refresh = SyftRefreshToken.for_delegated_profile(profile.user, profile)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.mark.django_db
class TestProfilePhoto:
    def test_photo_url_none_when_no_photo(self, parent, profile):
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            response = parent_client(parent).get(
                f'/api/profiles/{profile.profile_id}.json')
        assert response.status_code == 200
        assert response.json()['photo_url'] is None

    def test_create_with_photo_returns_photo_url(self, parent):
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            response = parent_client(parent).post(
                '/api/profiles.json',
                {'name': 'Maya', 'photo': make_png()}, format='multipart')
        assert response.status_code == 201, response.content
        body = response.json()
        assert body['photo_url'] is not None
        assert body['photo_url'].startswith('https://photos.test/')
        assert body['photo_url'].endswith('.jpg')
        profile = Profile.objects.get(profile_id=body['profile_id'])
        assert profile.photo_filename.endswith('.jpg')

    def test_update_replaces_photo(self, parent, profile):
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            first = parent_client(parent).put(
                f'/api/profiles/{profile.profile_id}.json',
                {'name': 'Maya', 'photo': make_png('one.png')}, format='multipart')
            second = parent_client(parent).put(
                f'/api/profiles/{profile.profile_id}.json',
                {'name': 'Maya', 'photo': make_png('two.png')}, format='multipart')
        assert first.status_code == 200, first.content
        assert second.status_code == 200, second.content
        assert second.json()['photo_url'] != first.json()['photo_url']
        profile.refresh_from_db()
        assert profile.photo_filename in second.json()['photo_url']

    def test_remove_photo_clears(self, parent, profile):
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            updated = parent_client(parent).put(
                f'/api/profiles/{profile.profile_id}.json',
                {'name': 'Maya', 'photo': make_png()}, format='multipart')
            assert updated.json()['photo_url'] is not None
            cleared = parent_client(parent).put(
                f'/api/profiles/{profile.profile_id}.json',
                {'name': 'Maya', 'remove_photo': 'true'}, format='multipart')
        assert cleared.status_code == 200, cleared.content
        assert cleared.json()['photo_url'] is None
        profile.refresh_from_db()
        assert profile.photo_filename is None

    def test_text_only_update_keeps_photo(self, parent, profile):
        profile.photo_filename = 'existing.jpg'
        profile.save()
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            response = parent_client(parent).put(
                f'/api/profiles/{profile.profile_id}.json',
                {'name': 'Maya Renamed'}, format='json')
        assert response.status_code == 200, response.content
        assert response.json()['photo_url'] == 'https://photos.test/existing.jpg'
        profile.refresh_from_db()
        assert profile.photo_filename == 'existing.jpg'

    def test_invalid_photo_type_returns_400(self, parent, profile):
        bad = SimpleUploadedFile('face.txt', b'not an image', content_type='text/plain')
        response = parent_client(parent).put(
            f'/api/profiles/{profile.profile_id}.json',
            {'name': 'Maya', 'photo': bad}, format='multipart')
        assert response.status_code == 400
        assert 'photo' in response.json()
        profile.refresh_from_db()
        assert profile.photo_filename is None

    def test_teen_cannot_upload_photo(self, parent, profile):
        response = teen_client(profile).put(
            f'/api/profiles/{profile.profile_id}.json',
            {'name': 'Maya', 'photo': make_png()}, format='multipart')
        assert response.status_code == 403

    def test_self_endpoint_includes_photo_url(self, parent, profile):
        profile.photo_filename = 'maya.jpg'
        profile.save()
        s3 = fake_s3()
        with patch('bots.services.images.boto3.client', return_value=s3):
            response = teen_client(profile).get('/api/profiles/self.json')
        assert response.status_code == 200
        assert response.json()['photo_url'] == 'https://photos.test/maya.jpg'
