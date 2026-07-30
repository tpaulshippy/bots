import json
import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Device, Profile, RevenueCatWebhookEvent


@pytest.fixture
def user_a(db):
    return User.objects.create_user(username='usera', email='a@example.com', password='pass')


@pytest.fixture
def user_b(db):
    return User.objects.create_user(username='userb', email='b@example.com', password='pass')


def auth_client_for(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.mark.django_db
class TestGetChatResponseOwnership:
    """User B must not access user A's chats/profiles/bots via /api/chats/<chat_id>"""

    def test_cannot_create_chat_with_other_users_profile(self, user_a, user_b):
        profile = Profile.objects.create(user=user_a, name='A Profile')

        response = auth_client_for(user_b).post('/api/chats/new', {
            'message': 'hello',
            'profile': str(profile.profile_id),
        })

        assert response.status_code == 404
        assert Chat.objects.count() == 0

    def test_cannot_create_chat_with_other_users_bot(self, user_a, user_b):
        bot = Bot.objects.create(user=user_a, name='A Bot')

        response = auth_client_for(user_b).post('/api/chats/new', {
            'message': 'hello',
            'bot': str(bot.bot_id),
        })

        assert response.status_code == 404
        assert Chat.objects.count() == 0

    def test_cannot_post_to_other_users_chat(self, user_a, user_b):
        chat = Chat.objects.create(user=user_a, title='A Chat')

        response = auth_client_for(user_b).post(f'/api/chats/{chat.chat_id}', {
            'message': 'hello',
        })

        assert response.status_code == 404
        assert chat.messages.count() == 0

    def test_missing_image_file_returns_400(self, user_a):
        chat = Chat.objects.create(user=user_a, title='A Chat')

        response = auth_client_for(user_a).post(f'/api/chats/{chat.chat_id}', {
            'message': 'hello',
            'not_image': SimpleUploadedFile('pic.png', b'fake', content_type='image/png'),
        }, format='multipart')

        assert response.status_code == 400
        assert chat.messages.count() == 0


@pytest.mark.django_db
class TestRevenueCatWebhookAuth:
    url = '/api/revenuecat/webhook'
    secret = 'test-webhook-secret'

    def payload(self, user):
        return json.dumps({
            'event': {
                'type': 'INITIAL_PURCHASE',
                'app_user_id': str(user.id),
                'entitlement_ids': ['plus'],
            }
        })

    def test_missing_auth_header_rejected(self, user_a):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=self.secret):
            response = APIClient().post(self.url, self.payload(user_a), content_type='application/json')

        assert response.status_code == 401
        assert RevenueCatWebhookEvent.objects.count() == 0

    def test_wrong_auth_header_rejected(self, user_a):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=self.secret):
            response = APIClient().post(
                self.url, self.payload(user_a),
                content_type='application/json', HTTP_AUTHORIZATION='wrong-secret')

        assert response.status_code == 401
        assert RevenueCatWebhookEvent.objects.count() == 0

    def test_empty_configured_secret_rejects_requests(self, user_a):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=''):
            response = APIClient().post(
                self.url, self.payload(user_a),
                content_type='application/json', HTTP_AUTHORIZATION='anything')

        assert response.status_code == 401
        assert RevenueCatWebhookEvent.objects.count() == 0

    def test_malformed_json_returns_400(self):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=self.secret):
            response = APIClient().post(
                self.url, 'not json',
                content_type='application/json', HTTP_AUTHORIZATION=self.secret)

        assert response.status_code == 400
        assert RevenueCatWebhookEvent.objects.count() == 0

    def test_missing_event_returns_400(self):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=self.secret):
            response = APIClient().post(
                self.url, json.dumps({'foo': 'bar'}),
                content_type='application/json', HTTP_AUTHORIZATION=self.secret)

        assert response.status_code == 400

    def test_valid_request_succeeds(self, user_a):
        with override_settings(REVENUECAT_WEBHOOK_AUTH_HEADER=self.secret):
            response = APIClient().post(
                self.url, self.payload(user_a),
                content_type='application/json', HTTP_AUTHORIZATION=self.secret)

        assert response.status_code == 200
        assert response.json() == {'status': 'success'}
        user_a.user_account.refresh_from_db()
        assert user_a.user_account.subscription_level == 2
        assert RevenueCatWebhookEvent.objects.count() == 1


@pytest.mark.django_db
class TestDeviceNotificationTokenQuery:
    """?notificationToken= must only return the requesting user's devices"""

    def test_token_query_scoped_to_requesting_user(self, user_a, user_b):
        Device.objects.create(user=user_a, notification_token='token-a')
        Device.objects.create(user=user_b, notification_token='token-b')

        client = auth_client_for(user_b)

        response = client.get('/api/devices.json?notificationToken=token-a')
        assert response.status_code == 200
        assert response.json()['results'] == []

        response = client.get('/api/devices.json?notificationToken=token-b')
        assert response.status_code == 200
        results = response.json()['results']
        assert len(results) == 1
        assert results[0]['notification_token'] == 'token-b'
