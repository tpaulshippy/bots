from django.db import models
from bots.models.app import App
from bots.models.ai_model import AiModel
    
class AppAiModel(models.Model):
    app = models.ForeignKey(
        App,
        related_name='app_ai_models',
        default=1,
        on_delete=models.SET_NULL,
        null=True
    )
    ai_model = models.ForeignKey(
        AiModel,
        related_name='app_ai_models',
        default=1,
        on_delete=models.SET_NULL,
        null=True
    )
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.app.name} - {self.ai_model.name}'

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['app', 'ai_model'],
                name='unique_app_ai_model'
            ),
            models.UniqueConstraint(
                fields=['app', 'is_default'],
                condition=models.Q(is_default=True),
                name='unique_default_model'
            )
        ]
