from django.test import TestCase
from django.contrib.auth.models import User
from bots.models import Chat, Message, Device, Profile, Bot
from unittest.mock import Mock, patch
from bots import signals

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
