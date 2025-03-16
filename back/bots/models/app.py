from django.db import models
import uuid
    
class App(models.Model):
    app_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['is_default'],
                condition=models.Q(is_default=True),
                name='unique_default_app'
            )
        ]
