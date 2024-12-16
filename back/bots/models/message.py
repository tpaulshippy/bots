from django.db import models
import uuid
from .chat import Chat
    
class Message(models.Model):
    chat = models.ForeignKey(Chat, related_name='messages', on_delete=models.CASCADE)
    message_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    text = models.TextField()
    role = models.CharField(max_length=50, default='user')
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.text