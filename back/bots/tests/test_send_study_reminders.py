import secrets
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone

from bots.models import Deck, Device, Flashcard, Profile


@pytest.fixture
def parent(db):
    return User.objects.create_user(
        username='study-parent', email='sp@example.com', password=secrets.token_urlsafe()
    )


@pytest.fixture
def profile(parent):
    return Profile.objects.create(user=parent, name='Maya')


def _deck(profile, name='Cell Bio'):
    return Deck.objects.create(profile=profile, name=name)


def _card(deck, order=0, due_at=None):
    return Flashcard.objects.create(
        deck=deck,
        front=f'Front {order}',
        back=f'Back {order}',
        order=order,
        due_at=due_at if due_at is not None else timezone.now() - timedelta(hours=1),
    )


def _device(user, **flags):
    return Device.objects.create(user=user, notification_token=secrets.token_hex(8), **flags)


@pytest.mark.django_db
class TestSendStudyReminders:
    @patch('bots.models.device.NotificationClient')
    def test_single_due_deck_links_straight_to_study(self, mock_client, parent, profile):
        deck = _deck(profile)
        _card(deck, order=0)
        _card(deck, order=1)
        device = _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        calls = mock_client.return_value.notify.call_args_list
        assert len(calls) == 1
        notification = calls[0].args[0]
        assert notification.to == device.notification_token
        assert notification.title == 'Study reminder'
        assert notification.body == '2 cards due in "Cell Bio" — time to review!'
        assert notification.data == {'target': 'study_due', 'deck_id': str(deck.deck_id)}

    @patch('bots.models.device.NotificationClient')
    def test_singular_card_body(self, mock_client, parent, profile):
        _card(_deck(profile))
        _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        notification = mock_client.return_value.notify.call_args.args[0]
        assert notification.body == '1 card due in "Cell Bio" — time to review!'

    @patch('bots.models.device.NotificationClient')
    def test_multiple_decks_aggregate_without_deep_link(self, mock_client, parent, profile):
        _card(_deck(profile, name='Cell Bio'))
        _card(_deck(profile, name='Spanish'))
        _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        notification = mock_client.return_value.notify.call_args.args[0]
        assert notification.body == '2 cards due across 2 decks — time to review!'
        assert notification.data == {'target': 'study_due'}

    @patch('bots.models.device.NotificationClient')
    def test_future_cards_do_not_trigger(self, mock_client, parent, profile):
        _card(_deck(profile), due_at=timezone.now() + timedelta(days=3))
        _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_no_due_cards_skips_user(self, mock_client, parent, profile):
        _deck(profile)
        _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_opted_out_and_deleted_devices_are_skipped(self, mock_client, parent, profile):
        _card(_deck(profile))
        _device(parent, notify_study_due=False)
        _device(parent, notify_study_due=True, deleted_at=timezone.now())

        call_command('send_study_reminders')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_digest_only_devices_keep_digest_as_single_source(self, mock_client, parent, profile):
        _card(_deck(profile))
        _device(parent, notify_study_due=True, notify_digest_only=True)

        call_command('send_study_reminders')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_other_users_cards_do_not_leak(self, mock_client, parent, profile, db):
        other = User.objects.create_user(
            username='other', email='o@example.com', password=secrets.token_urlsafe()
        )
        other_profile = Profile.objects.create(user=other, name='Sam')
        _card(_deck(other_profile))
        _device(parent, notify_study_due=True)

        call_command('send_study_reminders')

        mock_client.return_value.notify.assert_not_called()
