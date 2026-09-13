from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class AiModel(models.Model):
    model_id = models.CharField(max_length=255, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    input_token_cost = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.0)]
    )
    output_token_cost = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.0)]
    )
    is_default = models.BooleanField(default=False)
    supported_input_modalities = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['is_default'],
                condition=models.Q(is_default=True),
                name='unique_default_model'
            )
        ]


@receiver(post_delete, sender=AiModel)
def void_reset_baselines_on_model_delete(sender, instance, **kwargs):
    """A deleted model's stamped rows reprice at default rates, which can
    drop the recomputed total below a same-day reset baseline and clamp
    usage to zero. Void baselines (conservative recount until midnight);
    rate edits are caught instead by the modified_at guard in
    UserAccount._reset_baseline_applies, since a deleted row leaves no
    modified trace behind."""
    from bots.models.user_account import UserAccount
    UserAccount.objects.filter(usage_reset_at__isnull=False).update(
        usage_reset_at=None,
        usage_reset_timezone=None,
        usage_reset_cost=0.0,
        usage_reset_input_tokens=0,
        usage_reset_output_tokens=0,
    )
