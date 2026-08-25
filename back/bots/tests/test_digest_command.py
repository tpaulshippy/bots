from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone

from bots.models import Bot, Chat, Device, Profile


@pytest.fixture
def parent(db):
    return User.objects.create_user(username='parent', email='p@example.com', password='pass')


def _chat(user, profile, bot, when):
    chat = Chat.objects.create(user=user, profile=profile, bot=bot, title='t')
    Chat.objects.filter(pk=chat.pk).update(created_at=when)
    return chat


@pytest.mark.django_db
class TestSendActivityDigests:
    @patch('bots.models.device.NotificationClient')
    def test_digest_sent_for_active_digest_only_device(self, mock_client, parent):
        maya = Profile.objects.create(user=parent, name='Maya')
        sam = Profile.objects.create(user=parent, name='Sam')
        bot = Bot.objects.create(user=parent, name='Penelope')
        now = timezone.now()
        _chat(parent, maya, bot, now - timedelta(hours=2))
        _chat(parent, maya, bot, now - timedelta(hours=3))
        # Sam's only chat is old; must not appear in the 24h digest.
        _chat(parent, sam, bot, now - timedelta(days=3))

        device = Device.objects.create(
            user=parent, notification_token='digest-tok', notify_digest_only=True)

        call_command('send_activity_digests')

        calls = mock_client.return_value.notify.call_args_list
        assert len(calls) == 1
        notification = calls[0].args[0]
        assert notification.to == device.notification_token
        assert notification.title == 'Syft daily summary'
        assert notification.body == 'Maya: 2 chats'
        assert notification.data == {'target': 'parent_activity'}

    @patch('bots.models.device.NotificationClient')
    def test_no_activity_skips_user(self, mock_client, parent):
        Device.objects.create(
            user=parent, notification_token='digest-tok', notify_digest_only=True)
        Profile.objects.create(user=parent, name='Quiet Kid')

        call_command('send_activity_digests')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_non_digest_devices_are_ignored_by_command(self, mock_client, parent):
        maya = Profile.objects.create(user=parent, name='Maya')
        bot = Bot.objects.create(user=parent, name='Penelope')
        _chat(parent, maya, bot, timezone.now() - timedelta(hours=1))

        Device.objects.create(
            user=parent, notification_token='instant-tok',
            notify_on_new_message=True, notify_digest_only=False)
        Device.objects.create(
            user=parent, notification_token='deleted-tok',
            notify_digest_only=True, deleted_at=timezone.now())

        call_command('send_activity_digests')

        mock_client.return_value.notify.assert_not_called()

    @patch('bots.models.device.NotificationClient')
    def test_singular_chat_body(self, mock_client, parent):
        maya = Profile.objects.create(user=parent, name='Maya')
        bot = Bot.objects.create(user=parent, name='Penelope')
        _chat(parent, maya, bot, timezone.now() - timedelta(hours=1))
        Device.objects.create(
            user=parent, notification_token='digest-tok', notify_digest_only=True)

        call_command('send_activity_digests')

        notification = mock_client.return_value.notify.call_args.args[0]
        assert notification.body == 'Maya: 1 chat'
