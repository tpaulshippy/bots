from django.db import models
    
class AiModel(models.Model):
    model_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    input_token_cost = models.FloatField(default=1.0)
    output_token_cost = models.FloatField(default=1.0)
    is_default = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
