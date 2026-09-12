import uuid

from django.db import models

from .chat import Chat


class Message(models.Model):
    INTENT_CHOICES = [
        ('chat', 'Chat'),
        ('homework', 'Homework'),
        ('check_work', 'Check Work'),
    ]

    chat = models.ForeignKey(Chat, related_name='messages', on_delete=models.CASCADE)
    message_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    text = models.TextField()
    role = models.CharField(max_length=50, default='user')
    order = models.IntegerField(default=0)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    image_filename = models.CharField(max_length=255, blank=True, null=True)
    # True when the server-side safety filter denied this message. Denied
    # content is still visible in the chat history but must never re-enter
    # the model context on later turns (see Chat.get_input()).
    safety_blocked = models.BooleanField(default=False)
    intent = models.CharField(max_length=16, choices=INTENT_CHOICES, default='chat', blank=True)
    meta = models.JSONField(default=dict, blank=True)
    voice_cost = models.DecimalField(max_digits=10, decimal_places=6, default=0)

    def __str__(self):
        user_str = getattr(self.chat.user, 'email', 'unknown')
        profile_str = getattr(self.chat.profile, 'name', 'unknown')
        return f'{user_str} - {profile_str} - {self.text}'