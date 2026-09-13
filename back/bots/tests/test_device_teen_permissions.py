import secrets

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from bots.models import Device, Profile
from bots.tokens import SyftRefreshToken


@pytest.fixture
def parent(db):
    return User.objects.create_user(
        username='device-parent', email='dp@example.com', password=secrets.token_urlsafe()
    )


@pytest.fixture
def teen_profile(parent):
    return Profile.objects.create(user=parent, name='Maya', oauth_email='maya@example.com')


def parent_client(parent):
    client = APIClient()
    refresh = SyftRefreshToken.for_user(parent)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def teen_client(teen_profile):
    client = APIClient()
    refresh = SyftRefreshToken.for_delegated_profile(teen_profile.user, teen_profile)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def _device(parent, **flags):
    params = {
        'notify_on_new_chat': True,
        'notify_on_new_message': True,
        'notify_digest_only': False,
        'notify_study_due': False,
    }
    params.update(flags)
    return Device.objects.create(
        user=parent, notification_token=secrets.token_hex(8), **params
    )


def _full_payload(device, **overrides):
    payload = {
        'notification_token': device.notification_token,
        'notify_on_new_chat': device.notify_on_new_chat,
        'notify_on_new_message': device.notify_on_new_message,
        'notify_digest_only': device.notify_digest_only,
        'notify_study_due': device.notify_study_due,
        'deleted_at': None,
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
class TestTeenDeviceWrites:
    """Teen-delegated sessions own one opt-in (notify_study_due). Parent
    surveillance flags and device identity must be teen-immutable, or a
    crafted client could silently disable oversight."""

    def test_teen_can_flip_study_due(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.device_id}.json',
            _full_payload(device, notify_study_due=True),
            format='json',
        )

        assert response.status_code == 200
        device.refresh_from_db()
        assert device.notify_study_due is True

    def test_teen_form_encoded_flags_compare_as_booleans(self, parent, teen_profile):
        """Multipart/form PUTs deliver every value as a string: unchanged
        parent flags ('true'/'false') must still compare equal instead of
        wrongly 403ing (chained-comparison regression)."""
        device = _device(parent)

        payload = {k: str(v) for k, v in _full_payload(device).items()}
        payload['notify_study_due'] = 'true'
        # Multipart has no null literal: unchanged nulls are omitted.
        del payload['deleted_at']
        response = teen_client(teen_profile).put(
            f'/api/devices/{device.device_id}.json',
            payload,
            format='multipart',
        )

        assert response.status_code == 200
        device.refresh_from_db()
        assert device.notify_study_due is True
        assert device.notify_on_new_chat is True

    def test_teen_cannot_disable_parent_chat_flag(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.device_id}.json',
            _full_payload(device, notify_on_new_chat=False, notify_study_due=True),
            format='json',
        )

        assert response.status_code == 403
        device.refresh_from_db()
        assert device.notify_on_new_chat is True
        assert device.notify_study_due is False

    def test_teen_cannot_enable_digest_only(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.device_id}.json',
            _full_payload(device, notify_digest_only=True),
            format='json',
        )

        assert response.status_code == 403
        device.refresh_from_db()
        assert device.notify_digest_only is False

    def test_teen_cannot_touch_notification_token(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.device_id}.json',
            _full_payload(device, notification_token='attacker-token'),
            format='json',
        )

        assert response.status_code == 403
        device.refresh_from_db()
        assert device.notification_token != 'attacker-token'

    def test_teen_cannot_delete_device(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).delete(f'/api/devices/{device.device_id}.json')

        assert response.status_code == 403
        assert Device.objects.filter(pk=device.pk).exists()

    def test_teen_create_forces_parent_flag_defaults(self, parent, teen_profile):
        response = teen_client(teen_profile).post(
            '/api/devices.json',
            {
                'notification_token': secrets.token_hex(8),
                'notify_on_new_chat': True,
                'notify_on_new_message': True,
                'notify_digest_only': True,
                'notify_study_due': True,
                'deleted_at': '2026-01-01T00:00:00Z',
            },
            format='json',
        )

        assert response.status_code == 201
        created = Device.objects.get(notification_token=response.json()['notification_token'])
        assert created.notify_on_new_chat is False
        assert created.notify_on_new_message is False
        assert created.notify_digest_only is False
        assert created.deleted_at is None
        assert created.notify_study_due is True

    def test_parent_can_still_update_all_flags(self, parent, teen_profile):
        device = _device(parent)

        response = parent_client(parent).put(
            f'/api/devices/{device.id}.json',
            _full_payload(
                device,
                notify_on_new_chat=False,
                notify_digest_only=True,
                notify_study_due=True,
            ),
            format='json',
        )

        assert response.status_code == 200
        device.refresh_from_db()
        assert device.notify_on_new_chat is False
        assert device.notify_digest_only is True
        assert device.notify_study_due is True


@pytest.mark.django_db
class TestTeenDeviceEnumeration:
    """Teen-delegated sessions must not enumerate the parent account's
    devices: an unfiltered list would leak every device id and notification
    token (push targets). Token lookup (own physical device) and
    retrieve-by-id (unguessable UUID, needed by the teen client) stay open."""

    def test_teen_unfiltered_list_is_empty(self, parent, teen_profile):
        _device(parent)
        _device(parent)

        response = teen_client(teen_profile).get('/api/devices.json')

        assert response.status_code == 200
        assert response.json()['results'] == []

    def test_teen_token_lookup_returns_own_device(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).get(
            f'/api/devices.json?notificationToken={device.notification_token}'
        )

        assert response.status_code == 200
        results = response.json()['results']
        assert len(results) == 1
        assert results[0]['notification_token'] == device.notification_token

    def test_teen_token_lookup_hides_unknown_tokens(self, parent, teen_profile):
        _device(parent)

        response = teen_client(teen_profile).get(
            '/api/devices.json?notificationToken=no-such-token'
        )

        assert response.status_code == 200
        assert response.json()['results'] == []

    def test_teen_retrieve_by_uuid_still_works(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).get(f'/api/devices/{device.device_id}.json')

        assert response.status_code == 200
        assert response.json()['notification_token'] == device.notification_token

    def test_teen_integer_pk_routes_are_404(self, parent, teen_profile):
        """Sequential pks are brute-forceable, so teen detail routes are
        UUID-only: integer lookups 404 for reads and writes alike."""
        device = _device(parent)

        assert teen_client(teen_profile).get(f'/api/devices/{device.id}.json').status_code == 404

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.id}.json',
            _full_payload(device, notify_study_due=True),
            format='json',
        )
        assert response.status_code == 404
        device.refresh_from_db()
        assert device.notify_study_due is False

    def test_parent_integer_pk_routes_still_work(self, parent, teen_profile):
        device = _device(parent)

        response = parent_client(parent).get(f'/api/devices/{device.id}.json')

        assert response.status_code == 200

    def test_parent_list_unchanged(self, parent, teen_profile):
        _device(parent)
        _device(parent)

        response = parent_client(parent).get('/api/devices.json')

        assert response.status_code == 200
        assert response.json()['count'] == 2


@pytest.mark.django_db
class TestDeletedDeviceReregistration:
    """A soft-deleted device that re-registers (same push token) must come
    back to life: token lookups exclude dead rows, and creates revive the
    soft-deleted row in place instead of colliding on the unique token —
    otherwise the row stays deleted (and reminder-less) forever."""

    def test_token_lookup_excludes_deleted_rows(self, parent, teen_profile):
        device = _device(parent, deleted_at=timezone.now())

        response = teen_client(teen_profile).get(
            f'/api/devices.json?notificationToken={device.notification_token}'
        )

        assert response.status_code == 200
        assert response.json()['results'] == []

    def test_parent_token_lookup_excludes_deleted_rows(self, parent):
        device = _device(parent, deleted_at=timezone.now())

        response = parent_client(parent).get(
            f'/api/devices.json?notificationToken={device.notification_token}'
        )

        assert response.status_code == 200
        assert response.json()['results'] == []

    def test_create_revives_soft_deleted_row(self, parent):
        device = _device(parent, deleted_at=timezone.now(), notify_study_due=False)

        response = parent_client(parent).post(
            '/api/devices.json',
            {
                'notification_token': device.notification_token,
                'notify_on_new_chat': False,
                'notify_on_new_message': False,
                'notify_digest_only': False,
                'notify_study_due': True,
            },
            format='json',
        )

        assert response.status_code == 201
        device.refresh_from_db()
        assert device.deleted_at is None
        assert device.notify_study_due is True
        assert response.json()['device_id'] == str(device.device_id)

    def test_teen_create_revives_with_forced_defaults(self, parent, teen_profile):
        device = _device(
            parent,
            deleted_at=timezone.now(),
            notify_on_new_chat=True,
            notify_study_due=False,
        )

        response = teen_client(teen_profile).post(
            '/api/devices.json',
            {
                'notification_token': device.notification_token,
                'notify_on_new_chat': True,
                'notify_on_new_message': True,
                'notify_digest_only': True,
                'notify_study_due': True,
            },
            format='json',
        )

        assert response.status_code == 201
        device.refresh_from_db()
        assert device.deleted_at is None
        assert device.notify_on_new_chat is False
        assert device.notify_on_new_message is False
        assert device.notify_digest_only is False
        assert device.notify_study_due is True

    def test_create_with_live_duplicate_token_is_400(self, parent):
        device = _device(parent)

        response = parent_client(parent).post(
            '/api/devices.json',
            {
                'notification_token': device.notification_token,
                'notify_on_new_chat': False,
                'notify_on_new_message': False,
                'notify_digest_only': False,
                'notify_study_due': True,
            },
            format='json',
        )

        assert response.status_code == 400
        assert 'notification_token' in response.json()

    def test_detail_route_hides_soft_deleted_rows(self, parent, teen_profile):
        device = _device(parent, deleted_at=timezone.now())

        assert parent_client(parent).get(f'/api/devices/{device.device_id}.json').status_code == 404
        assert teen_client(teen_profile).get(f'/api/devices/{device.device_id}.json').status_code == 404

        response = parent_client(parent).put(
            f'/api/devices/{device.device_id}.json',
            _full_payload(device, notify_study_due=True),
            format='json',
        )
        assert response.status_code == 404
        device.refresh_from_db()
        assert device.deleted_at is not None
        assert device.notify_study_due is False

    def test_update_retargeting_another_live_token_is_400(self, parent):
        first = _device(parent)
        second = _device(parent)

        response = parent_client(parent).put(
            f'/api/devices/{first.id}.json',
            _full_payload(first, notification_token=second.notification_token),
            format='json',
        )

        assert response.status_code == 400
        assert 'notification_token' in response.json()
        first.refresh_from_db()
        assert first.notification_token != second.notification_token
