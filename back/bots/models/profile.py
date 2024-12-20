from django.db import models
import uuid
    
class Profile(models.Model):
    profile_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
