import secrets

import pytest
from django.contrib.auth.models import User
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
            f'/api/devices/{device.id}.json',
            _full_payload(device, notify_study_due=True),
            format='json',
        )

        assert response.status_code == 200
        device.refresh_from_db()
        assert device.notify_study_due is True

    def test_teen_cannot_disable_parent_chat_flag(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.id}.json',
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
            f'/api/devices/{device.id}.json',
            _full_payload(device, notify_digest_only=True),
            format='json',
        )

        assert response.status_code == 403
        device.refresh_from_db()
        assert device.notify_digest_only is False

    def test_teen_cannot_touch_notification_token(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).put(
            f'/api/devices/{device.id}.json',
            _full_payload(device, notification_token='attacker-token'),
            format='json',
        )

        assert response.status_code == 403
        device.refresh_from_db()
        assert device.notification_token != 'attacker-token'

    def test_teen_cannot_delete_device(self, parent, teen_profile):
        device = _device(parent)

        response = teen_client(teen_profile).delete(f'/api/devices/{device.id}.json')

        assert response.status_code == 403
        assert Device.objects.filter(pk=device.pk).exists()

    def test_teen_create_forces_parent_flag_defaults(self, parent, teen_profile):
        response = teen_client(teen_profile).post(
            '/api/devices.json',
            {
                'notification_token': secrets.token_hex(8),
                'notify_on_new_chat': True,
                'notify_on_new_message': False,
                'notify_digest_only': True,
                'notify_study_due': True,
            },
            format='json',
        )

        assert response.status_code == 201
        created = Device.objects.get(notification_token=response.json()['notification_token'])
        assert created.notify_on_new_chat is False
        assert created.notify_on_new_message is True
        assert created.notify_digest_only is False
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
