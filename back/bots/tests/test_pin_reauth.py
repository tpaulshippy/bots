from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import aware_utcnow, datetime_to_epoch

from bots.models import AiModel, Bot, Profile
from bots.services.parent_reauth import (
    MAX_PIN_FAILURES,
    PARENT_REAUTH_HEADER,
    ParentReauthToken,
    has_valid_parent_reauth,
)

User = get_user_model()

TEST_PIN = '1234'
REAUTH_HEADER_KEY = 'HTTP_' + PARENT_REAUTH_HEADER.replace('-', '_').upper()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def teen_auth_client(user):
    """Client whose access token carries the teen-delegated claim (feature 01)."""
    client = APIClient()
    token = RefreshToken.for_user(user)
    token['is_teen_delegated'] = True
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


def with_reauth_header(client, user):
    """Add a valid X-Parent-Reauth header alongside existing credentials."""
    token = str(ParentReauthToken.for_user(user))
    client.credentials(
        HTTP_AUTHORIZATION=client._credentials['HTTP_AUTHORIZATION'],
        **{REAUTH_HEADER_KEY: token},
    )
    return client


def build_request(user, **headers):
    """Build an authenticated DRF request for permission-helper unit tests."""
    factory = APIRequestFactory()
    request = factory.post('/api/user', **headers)
    authenticated = JWTAuthentication().authenticate(request)
    assert authenticated is not None
    request.user, request.auth = authenticated
    return request


@pytest.fixture
def parent_with_pin(db, load_fixture):
    user = User.objects.create_user(username='parent', email='p@example.com', password='pass')
    response = auth_client(user).post('/api/user', {'pin': TEST_PIN}, format='json')
    assert response.status_code == 200
    return user


@pytest.mark.django_db
class TestSetPin:
    def test_first_set_hashes_pin(self, load_fixture):
        user = User.objects.create_user(username='u1', email='u1@example.com', password='pass')
        account = user.user_account

        assert account.pin_hash is None
        response = auth_client(user).post('/api/user', {'pin': TEST_PIN}, format='json')

        assert response.status_code == 200
        account.refresh_from_db()
        assert account.pin_hash
        assert check_password(TEST_PIN, account.pin_hash)
        assert TEST_PIN not in account.pin_hash

    def test_first_set_does_not_require_current_pin_or_reauth(self, load_fixture):
        user = User.objects.create_user(username='u2', email='u2@example.com', password='pass')
        response = auth_client(user).post(
            '/api/user', {'pin': TEST_PIN, 'currentPin': ''}, format='json')
        assert response.status_code == 200

    @pytest.mark.parametrize('bad_pin', ['123', '123456789', 'abcd', '12 4', '', None, 1234])
    def test_invalid_pin_format_rejected(self, bad_pin, load_fixture):
        user = User.objects.create_user(username='u3', email='u3@example.com', password='pass')
        response = auth_client(user).post('/api/user', {'pin': bad_pin}, format='json')
        assert response.status_code == 400

    def test_change_requires_current_pin(self, parent_with_pin):
        client = auth_client(parent_with_pin)

        missing = client.post('/api/user', {'pin': '5678'}, format='json')
        wrong = client.post('/api/user', {'pin': '5678', 'currentPin': '9999'}, format='json')

        assert missing.status_code == 403
        assert wrong.status_code == 403
        parent_with_pin.user_account.refresh_from_db()
        assert check_password(TEST_PIN, parent_with_pin.user_account.pin_hash)

    def test_change_without_reauth_header_denied(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        response = client.post('/api/user', {'pin': '5678', 'currentPin': TEST_PIN}, format='json')
        assert response.status_code == 403
        parent_with_pin.user_account.refresh_from_db()
        assert check_password(TEST_PIN, parent_with_pin.user_account.pin_hash)

    def test_change_updates_hash_and_resets_failures(self, parent_with_pin):
        account = parent_with_pin.user_account
        account.pin_failed_attempts = 3
        account.save(update_fields=['pin_failed_attempts'])

        client = with_reauth_header(auth_client(parent_with_pin), parent_with_pin)
        response = client.post(
            '/api/user', {'pin': '5678', 'currentPin': TEST_PIN}, format='json')

        assert response.status_code == 200
        account.refresh_from_db()
        assert check_password('5678', account.pin_hash)
        assert not check_password(TEST_PIN, account.pin_hash)
        assert account.pin_failed_attempts == 0


@pytest.mark.django_db
class TestGetAccount:
    def test_get_never_returns_pin_or_hash(self, parent_with_pin):
        response = auth_client(parent_with_pin).get('/api/user')
        assert response.status_code == 200
        data = response.json()
        assert data['hasPin'] is True
        assert data['userId'] == parent_with_pin.id
        assert 'pin' not in data
        assert 'pinHash' not in data
        assert 'pin_hash' not in data
        assert TEST_PIN not in str(data)

    def test_get_reports_missing_pin(self, load_fixture):
        user = User.objects.create_user(username='nopin', email='n@example.com', password='pass')
        data = auth_client(user).get('/api/user').json()
        assert data['hasPin'] is False

    def test_get_reports_timezone(self, parent_with_pin):
        parent_with_pin.user_account.timezone = 'Pacific/Honolulu'
        parent_with_pin.user_account.save(update_fields=['timezone'])
        data = auth_client(parent_with_pin).get('/api/user').json()
        assert data['timezone'] == 'Pacific/Honolulu'


@pytest.mark.django_db
class TestReauthenticate:
    url = '/api/auth/reauthenticate'

    def test_correct_pin_returns_parent_session_token(self, parent_with_pin):
        response = auth_client(parent_with_pin).post(self.url, {'pin': TEST_PIN}, format='json')

        assert response.status_code == 200
        body = response.json()
        assert body['parentSessionToken']
        assert body['expiresAt']

    def test_resulting_token_grants_parent_reauth(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        token = client.post(
            self.url, {'pin': TEST_PIN}, format='json').json()['parentSessionToken']

        request = build_request(
            parent_with_pin,
            HTTP_X_PARENT_REAUTH=token,
            HTTP_AUTHORIZATION=client._credentials['HTTP_AUTHORIZATION'],
        )
        assert has_valid_parent_reauth(request)

    def test_wrong_pin_returns_remaining_attempts(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        first = client.post(self.url, {'pin': '9999'}, format='json')
        second = client.post(self.url, {'pin': '9999'}, format='json')

        assert first.status_code == 401
        assert first.json()['remainingAttempts'] == MAX_PIN_FAILURES - 1
        assert second.status_code == 401
        assert second.json()['remainingAttempts'] == MAX_PIN_FAILURES - 2

    def test_lockout_after_max_failures(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        for _ in range(MAX_PIN_FAILURES):
            last = client.post(self.url, {'pin': '9999'}, format='json')

        assert last.status_code == 423
        assert last.json()['lockedUntil']
        # Even the correct PIN is refused while locked.
        locked = client.post(self.url, {'pin': TEST_PIN}, format='json')
        assert locked.status_code == 423

    def test_unlock_after_window(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        for _ in range(MAX_PIN_FAILURES):
            client.post(self.url, {'pin': '9999'}, format='json')

        account = parent_with_pin.user_account
        account.pin_locked_until = timezone.now() - timedelta(seconds=1)
        account.save(update_fields=['pin_locked_until'])

        response = client.post(self.url, {'pin': TEST_PIN}, format='json')
        assert response.status_code == 200
        account.refresh_from_db()
        assert account.pin_failed_attempts == 0
        assert account.pin_locked_until is None

    def test_success_resets_failure_count(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        client.post(self.url, {'pin': '9999'}, format='json')
        ok = client.post(self.url, {'pin': TEST_PIN}, format='json')

        assert ok.status_code == 200
        parent_with_pin.user_account.refresh_from_db()
        assert parent_with_pin.user_account.pin_failed_attempts == 0

    def test_malformed_body_rejected(self, parent_with_pin):
        response = auth_client(parent_with_pin).post(self.url, {}, format='json')
        assert response.status_code == 400

    def test_reauth_without_pin_configured(self, load_fixture):
        user = User.objects.create_user(username='nopin2', email='n2@example.com', password='pass')
        response = auth_client(user).post(self.url, {'pin': TEST_PIN}, format='json')
        assert response.status_code == 400

    def test_regular_access_token_is_not_a_parent_session(self, parent_with_pin):
        """A normal login JWT must never satisfy the reauth capability check."""
        client = auth_client(parent_with_pin)
        request = build_request(
            parent_with_pin,
            HTTP_AUTHORIZATION=client._credentials['HTTP_AUTHORIZATION'],
        )
        assert not has_valid_parent_reauth(request)


@pytest.mark.django_db
class TestTeenDelegatedDenial:
    def test_teen_delegated_cannot_reauthenticate(self, parent_with_pin):
        client = teen_auth_client(parent_with_pin)
        response = client.post('/api/auth/reauthenticate', {'pin': TEST_PIN}, format='json')
        assert response.status_code == 403

    def test_teen_delegated_cannot_change_pin(self, parent_with_pin):
        client = teen_auth_client(parent_with_pin)
        response = client.post(
            '/api/user', {'pin': '5678', 'currentPin': TEST_PIN}, format='json')
        assert response.status_code == 403


@pytest.mark.django_db
class TestParentMutationsRequireReauth:
    def test_bot_create_without_reauth_denied(self, parent_with_pin):
        model = AiModel.objects.filter(is_default=True).first()
        response = auth_client(parent_with_pin).post('/api/bots.json', {
            'name': 'New Bot',
            'ai_model': str(model.model_id),
        }, format='json')
        assert response.status_code == 403
        assert Bot.objects.count() == 1  # only the provisioned default bot

    def test_bot_create_with_reauth_allowed(self, parent_with_pin):
        model = AiModel.objects.filter(is_default=True).first()
        client = with_reauth_header(auth_client(parent_with_pin), parent_with_pin)
        response = client.post('/api/bots.json', {
            'name': 'New Bot',
            'ai_model': str(model.model_id),
        }, format='json')
        assert response.status_code == 201
        assert Bot.objects.count() == 2

    def test_profile_update_without_reauth_denied(self, parent_with_pin):
        profile = Profile.objects.filter(user=parent_with_pin, deleted_at=None).first()
        client = auth_client(parent_with_pin)
        response = client.put(f'/api/profiles/{profile.profile_id}.json',
                              {'name': 'Renamed'}, format='json')
        assert response.status_code == 403
        profile.refresh_from_db()
        assert profile.name != 'Renamed'

    def test_profile_update_with_reauth_allowed(self, parent_with_pin):
        profile = Profile.objects.filter(user=parent_with_pin, deleted_at=None).first()
        client = with_reauth_header(auth_client(parent_with_pin), parent_with_pin)
        response = client.put(f'/api/profiles/{profile.profile_id}.json',
                              {'name': 'Renamed'}, format='json')
        assert response.status_code == 200
        profile.refresh_from_db()
        assert profile.name == 'Renamed'

    def test_reads_stay_open_without_reauth(self, parent_with_pin):
        client = auth_client(parent_with_pin)
        assert client.get('/api/bots.json').status_code == 200
        assert client.get('/api/profiles.json').status_code == 200

    def test_delete_account_without_reauth_denied(self, parent_with_pin):
        response = auth_client(parent_with_pin).delete('/api/user/delete')
        assert response.status_code == 403
        assert User.objects.filter(id=parent_with_pin.id).exists()

    def test_delete_account_with_reauth_allowed(self, parent_with_pin):
        client = with_reauth_header(auth_client(parent_with_pin), parent_with_pin)
        response = client.delete('/api/user/delete')
        assert response.status_code == 204
        assert not User.objects.filter(id=parent_with_pin.id).exists()

    def test_expired_or_garbage_header_denied(self, parent_with_pin):
        expired = ParentReauthToken.for_user(parent_with_pin)
        expired.payload['exp'] = datetime_to_epoch(aware_utcnow() - timedelta(minutes=1))

        profile = Profile.objects.filter(user=parent_with_pin, deleted_at=None).first()
        client = auth_client(parent_with_pin)
        for header_value in ('garbage', str(expired)):
            client.credentials(
                HTTP_AUTHORIZATION=client._credentials['HTTP_AUTHORIZATION'],
                **{REAUTH_HEADER_KEY: header_value})
            response = client.put(f'/api/profiles/{profile.profile_id}.json',
                                  {'name': 'Nope'}, format='json')
            assert response.status_code == 403


class _StubApps:
    """Minimal `apps` registry stand-in for running migration functions."""

    def __init__(self, model):
        self._model = model

    def get_model(self, app_label, model_name):
        return self._model


@pytest.mark.django_db
class TestLegacyPinMigration:
    """bots.0040 must convert legacy integer PINs into hashed pin_hash values."""

    def test_hash_legacy_pins_converts_integer_pins(self, load_fixture):
        import importlib

        from django.db import connection, models

        migration = importlib.import_module('bots.migrations.0040_hash_legacy_integer_pins')

        # Recreate the pre-migration schema state: restore the dropped column.
        with connection.cursor() as cursor:
            cursor.execute('ALTER TABLE bots_useraccount ADD COLUMN pin integer NULL')

        try:
            legacy_user = User.objects.create_user(
                username='legacy', email='legacy@example.com', password='pass')
            plain_user = User.objects.create_user(
                username='plain', email='plain@example.com', password='pass')

            with connection.cursor() as cursor:
                cursor.execute(
                    'UPDATE bots_useraccount SET pin = %s WHERE id = %s',
                    [4321, legacy_user.user_account.id])

            # Stand-in model mirroring historical UserAccount at 0040
            # (both `pin` and `pin_hash` exist), bound to the real table.
            class LegacyUserAccount(models.Model):
                class Meta:
                    app_label = 'bots'
                    db_table = 'bots_useraccount'
                    managed = False

                id = models.IntegerField(primary_key=True)
                pin = models.IntegerField(null=True)
                pin_hash = models.CharField(max_length=128, null=True, blank=True)
                pin_failed_attempts = models.PositiveSmallIntegerField(default=0)

            legacy_row = LegacyUserAccount.objects.get(id=legacy_user.user_account.id)
            plain_row = LegacyUserAccount.objects.get(id=plain_user.user_account.id)
            assert legacy_row.pin == 4321
            assert plain_row.pin is None
            assert legacy_row.pin_hash is None

            migration.hash_legacy_pins(_StubApps(LegacyUserAccount), None)

            legacy_user.user_account.refresh_from_db()
            plain_user.user_account.refresh_from_db()

            # The plaintext integer PIN became a verifiable hash...
            assert legacy_user.user_account.pin_hash
            assert check_password('4321', legacy_user.user_account.pin_hash)
            assert '4321' not in legacy_user.user_account.pin_hash
            assert legacy_user.user_account.pin_failed_attempts == 0
            # ...and accounts without a legacy PIN were left untouched.
            assert plain_user.user_account.pin_hash is None
        finally:
            with connection.cursor() as cursor:
                cursor.execute('ALTER TABLE bots_useraccount DROP COLUMN pin')
