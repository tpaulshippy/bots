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
    notify_on_new_chat = models.BooleanField(default=True)
    notify_on_new_message = models.BooleanField(default=True)

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.email + ' - ' + self.notification_token
    
    def notify(self, chat, is_new_chat):
        if self.notify_on_new_chat and is_new_chat:
            NotificationClient().notify(Notification(
                to=self.notification_token,
                sound='default',
                title=f"{chat.profile.name} asked {chat.bot.name} a question",
                body=chat.title,
                data={'chat_id': str(chat.chat_id)}
            ))
            
