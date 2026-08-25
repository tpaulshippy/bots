import uuid

from django.conf import settings
from django.db import models

from .bot import Bot
from .chat import Chat
from .profile import Profile


class SafetyEvent(models.Model):
    """Audit log of safety blocks. Admin-readable; parent API lands in 04."""

    event_id = models.UUIDField(default=uuid.uuid4, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.CASCADE)
    profile = models.ForeignKey(Profile, null=True, on_delete=models.SET_NULL)
    chat = models.ForeignKey(Chat, null=True, on_delete=models.SET_NULL)
    bot = models.ForeignKey(Bot, null=True, on_delete=models.SET_NULL)
    # input|output|web_query|web_result|tool_flashcard
    stage = models.CharField(max_length=32)
    # adult_topic|language|global_floor|web_blocked
    reason_code = models.CharField(max_length=64)
    # never store the full raw text when it matched a sexual/violent term
    snippet_redacted = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.stage}/{self.reason_code}"
