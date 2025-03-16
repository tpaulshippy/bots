from django.conf import settings
from django.db import models
import uuid
import requests

class Notification:
    def __init__(self, to, sound, title, body, data):
        self.to = to
        self.sound = sound
        self.title = title
        self.body = body
        self.data = data
        

class NotificationClient:
    def notify(self, notification):
        payload = notification.__dict__
        requests.post('https://exp.host/--/api/v2/push/send', json=payload)
        
    
class Device(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='devices',
        null=True
    )
    device_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    notification_token = models.CharField(max_length=255, unique=True)
    notify_on_new_chat = models.BooleanField(default=False)
    notify_on_new_message = models.BooleanField(default=True)

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.email + ' - ' + self.notification_token
    
    def notify_chat(self, chat):
        if self.notify_on_new_chat and not self.notify_on_new_message:
            NotificationClient().notify(Notification(
                to=self.notification_token,
                sound='default',
                title=f"{chat.profile.name} started a conversation with {chat.bot.name}",
                body=chat.title,
                data={'chat_id': str(chat.chat_id)}
            ))
            
    def notify_message(self, message):
        if self.notify_on_new_message and \
            not self.notify_on_new_chat and \
            message.chat.user == self.user and \
            message.role == 'user':
            if message.chat.profile:
                from_name = message.chat.profile.name
            else:
                from_name = self.user.first_name
            if message.chat.bot:
                to_name = message.chat.bot.name
            else:
                to_name = "unknown"
            NotificationClient().notify(Notification(
                to=self.notification_token,
                sound='default',
                title=f"{from_name} sent {to_name} a message",
                body=message.text,
                data={'chat_id': str(message.chat.chat_id)}
            ))
