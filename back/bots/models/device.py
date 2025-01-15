from django.conf import settings
from django.db import models
import uuid
    
class Device(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True
    )
    device_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    notification_token = models.CharField(max_length=255)
    notify_on_new_chat = models.BooleanField(default=True)
    notify_on_new_message = models.BooleanField(default=True)

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.email + ' - ' + self.notification_token
