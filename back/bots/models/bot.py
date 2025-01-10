from django.conf import settings
from django.db import models
import uuid

from bots.models.ai_model import AiModel
    
class Bot(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True
    )
    ai_model = models.ForeignKey(
        AiModel,
        on_delete=models.CASCADE,
        null=True
    )
    bot_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    model = models.CharField(max_length=255)
    system_prompt = models.TextField(null=True, blank=True)
    simple_editor = models.BooleanField(default=False)
    template_name = models.CharField(max_length=255, null=True, blank=True)
    response_length = models.IntegerField(default=200)
    restrict_language = models.BooleanField(default=True)
    restrict_adult_topics = models.BooleanField(default=True)
    
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.email + ' - ' + self.name
