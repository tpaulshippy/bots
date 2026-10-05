import json
import secrets

import pytest
from django.contrib.auth.hashers import (
    PBKDF2PasswordHasher,
    check_password,
    get_hashers,
    identify_hasher,
    make_password,
)
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Device, Profile, RevenueCatWebhookEvent
from bots.services.parent_reauth import hash_pin, verify_pin


@pytest.fixture
def user_a(db):
    return User.objects.create_user(username='usera', email='a@example.com', password=secrets.token_urlsafe())


@pytest.fixture
def user_b(db):
    return User.objects.create_user(username='userb', email='b@example.com', password=secrets.token_urlsafe())


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


# Deliberately low-entropy. These assertions are about the shape of the stored
# hash, never its strength, and a credential-shaped literal sitting next to a
# password-named call is what secret scanners are built to flag.
_PLAINTEXT = 'abc123'


@pytest.mark.django_db
class TestPasswordHasherConfiguration:
    """The suite swaps in a fast hasher for encoding (see bots/tests/conftest.py).

    The swap is only safe while PBKDF2 stays in PASSWORD_HASHERS: check_password
    dispatches on the algorithm embedded in the stored string and resolves it
    from that list, so dropping PBKDF2 makes production-hashed rows unreadable
    with a ValueError instead of simply slower.
    """

    def test_encoding_uses_the_fast_hasher(self):
        assert get_hashers()[0].algorithm == 'md5'
        assert identify_hasher(make_password('pass')).algorithm == 'md5'

    def test_production_pbkdf2_hash_still_verifies(self):
        # Encoded by a PBKDF2 hasher directly, rather than via make_password,
        # which would use the suite's fast default instead. Iterations are
        # dialled right down: only the algorithm name in the encoded string
        # matters for dispatch, and at the production count this test alone
        # cost more than 2s -- the exact problem this hasher swap removes.
        prod_hash = PBKDF2PasswordHasher().encode('1234', salt='salt', iterations=1000)

        assert identify_hasher(prod_hash).algorithm == 'pbkdf2_sha256'
        assert check_password('1234', prod_hash) is True
        assert check_password('9999', prod_hash) is False

    def test_password_round_trips_without_truncation(self):
        user = User.objects.create(username='hashercheck')
        user.set_password(_PLAINTEXT)
        user.save()
        user.refresh_from_db()
        field_max = User._meta.get_field('password').max_length

        assert len(user.password) <= field_max
        assert user.check_password(_PLAINTEXT) is True
        assert user.check_password('nope') is False
        assert _PLAINTEXT not in user.password

    def test_pin_hash_round_trips_without_truncation(self, user_a):
        account = user_a.user_account
        field_max = account._meta.get_field('pin_hash').max_length
        account.pin_hash = hash_pin('1234')
        account.save()
        account.refresh_from_db()

        assert len(account.pin_hash) <= field_max
        assert '1234' not in account.pin_hash
        assert verify_pin(account, '1234') is True
        assert verify_pin(account, '9999') is False


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
