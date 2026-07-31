from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase

from bots.models import AiModel, Bot, Chat, Device, Message, Profile
from bots.signals import PENELOPE_SYSTEM_PROMPT, provision_default_content


class SignalsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='12345')
        self.profile = Profile.objects.create(user=self.user)
        self.bot = Bot.objects.create(user=self.user)
        self.device = Device.objects.create(user=self.user)
    
    @patch.object(Device, 'notify_chat')
    def test_notify_devices_for_new_chat(self, mock_notify_chat):
        chat = Chat.objects.create(user=self.user, profile=self.profile, bot=self.bot)

        # Assert
        mock_notify_chat.assert_called_once_with(chat)

    @patch.object(Device, 'notify_message')
    def test_notify_devices_for_new_message(self, mock_notify_message):
        # Arrange
        self.user.devices.add(self.device)
        chat = Chat.objects.create(user=self.user, profile=self.profile, bot=self.bot)
        message = Message.objects.create(chat=chat, text="Test message")

        # Assert
        mock_notify_message.assert_called_once_with(message)

    @patch.object(Device, 'notify_chat')
    def test_no_notification_for_updated_chat(self, mock_notify_chat):
        # Arrange
        self.user.devices.add(self.device)
        chat = Chat.objects.create(user=self.user, profile=self.profile, bot=self.bot)
        
        # Reset the mock to clear the creation notification
        mock_notify_chat.reset_mock()
        
        # Act
        chat.save()  # Update the chat

        # Assert
        mock_notify_chat.assert_not_called()
        

    @patch.object(Device, 'notify_chat')
    @patch.object(Device, 'notify_message')
    def test_no_notification_for_user_without_devices(self, mock_notify_chat, mock_notify_message):
        # Arrange - user has no devices
        self.user.devices.clear()
        chat = Chat.objects.create(user=self.user, profile=self.profile, bot=self.bot)
        
        # Act
        chat.save()
        chat.messages.create(text="Test message")
        
        # Assert
        mock_notify_chat.assert_not_called()
        mock_notify_message.assert_not_called()


class ProvisionDefaultContentTests(TestCase):
    fixtures = ['ai_models.json']

    def test_new_user_is_provisioned_with_default_content(self):
        user = User.objects.create_user(username='newuser', password='12345', first_name='New')

        profile = Profile.objects.get(user=user)
        self.assertEqual(profile.name, 'New')

        bot = Bot.objects.get(user=user)
        self.assertEqual(bot.name, 'Penelope')
        self.assertTrue(bot.ai_model.is_default)
        self.assertEqual(bot.system_prompt, PENELOPE_SYSTEM_PROMPT)

        chat = Chat.objects.get(user=user)
        self.assertEqual(chat.title, "Can you help with writing?")
        self.assertEqual(chat.profile, profile)
        self.assertEqual(chat.bot, bot)

        messages = list(chat.messages.order_by('order'))
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0].role, 'system')
        self.assertEqual(messages[0].text, PENELOPE_SYSTEM_PROMPT)
        self.assertEqual(messages[1].role, 'assistant')

    def test_provisioning_is_idempotent(self):
        user = User.objects.create_user(username='newuser', password='12345')

        provision_default_content(user)
        user.save()

        self.assertEqual(Profile.objects.filter(user=user).count(), 1)
        self.assertEqual(Bot.objects.filter(user=user).count(), 1)
        self.assertEqual(Chat.objects.filter(user=user).count(), 1)
        self.assertEqual(Message.objects.filter(chat__user=user).count(), 2)

    def test_provisioning_skips_bot_and_chat_without_default_model(self):
        AiModel.objects.all().delete()

        user = User.objects.create_user(username='newuser', password='12345')

        self.assertEqual(Profile.objects.filter(user=user).count(), 1)
        self.assertFalse(Bot.objects.filter(user=user).exists())
        self.assertFalse(Chat.objects.filter(user=user).exists())
