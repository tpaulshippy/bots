from django.db import models
import uuid

class Chat(models.Model):
    chat_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(self.chat_id)

    def get_response(self, ai):
        response = ai.get_response(messages=self.messages.all())
        self.messages.create(text=response, role='assistant')