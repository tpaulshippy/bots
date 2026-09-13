from datetime import datetime, time

import pytz
from django.contrib.auth.models import User
from django.db import models, transaction
from django.utils import timezone

from .ai_model import AiModel
from .chat import Chat

MAX_COST_DAILY = {
    0: 0.01 / 31,
    1: 1.0 / 31,
    2: 5.0 / 31,
}

class UserAccount(models.Model):
    user = models.OneToOneField(User,
                                on_delete=models.CASCADE,
                                related_name='user_account')
    # Parent PIN, stored hashed (never plaintext). See docs/roadmap/02-pin-security-and-reauth.md
    pin_hash = models.CharField(max_length=128, null=True, blank=True)
    pin_failed_attempts = models.PositiveSmallIntegerField(default=0)
    pin_locked_until = models.DateTimeField(null=True, blank=True)
    subscription_level = models.IntegerField(default=0)
    timezone = models.CharField(max_length=50, default='UTC')
    # Set by the first-run onboarding wizard (feature 05); null for accounts
    # that predate it or have not finished onboarding yet.
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    # When an admin resets daily token limits, these record today's usage
    # at reset time. cost_for_today() then reports current usage minus this
    # baseline, so Chat token history is never modified. A pre-reset chat
    # that receives messages after the reset only re-counts its new tokens
    # (cumulative Chat counters would otherwise recharge the whole history).
    # The baseline only applies while the account timezone is unchanged
    # since the reset; on a timezone change it is ignored (conservative:
    # full-day usage counts again) rather than subtracted from a different
    # set of chats.
    usage_reset_at = models.DateTimeField(null=True, blank=True)
    usage_reset_timezone = models.CharField(max_length=50, null=True, blank=True)
    usage_reset_cost = models.FloatField(default=0.0)
    usage_reset_input_tokens = models.IntegerField(default=0)
    usage_reset_output_tokens = models.IntegerField(default=0)

    def __str__(self):
        return self.user.email

    def onboarding_completed(self):
        """Prefer the explicit flag set by the onboarding wizard; fall back to a
        heuristic for older accounts that will never run the wizard. A PIN
        alone isn't proof (PINs are optional), so real use — any user-sent
        message — counts too. Signup provisions only an assistant greeting,
        so fresh accounts (even with the seeded welcome chat) still gate."""
        if self.onboarding_completed_at is not None:
            return True
        if self.user.profile_set.filter(deleted_at=None).count() < 1:
            return False
        if self.pin_hash is not None:
            return True
        return Chat.objects.filter(
            user=self.user, messages__role='user').exists()

    def over_limit(self):
        from .usage_limit_hit import UsageLimitHit
        total, total_input_tokens, total_output_tokens = self.cost_for_today()
        if total >= MAX_COST_DAILY[self.subscription_level]:
            UsageLimitHit.objects.create(user_account=self,
                                         subscription_level=self.subscription_level,
                                         total_input_tokens=total_input_tokens,
                                         total_output_tokens=total_output_tokens)
            return True
        return False

    def cost_for_today(self):
        total, total_input_tokens, total_output_tokens = self._raw_cost_for_today()

        if self._reset_baseline_applies():
            total = max(0.0, total - self.usage_reset_cost)
            total_input_tokens = max(0, total_input_tokens - self.usage_reset_input_tokens)
            total_output_tokens = max(0, total_output_tokens - self.usage_reset_output_tokens)

        return total, total_input_tokens, total_output_tokens

    def _raw_cost_for_today(self):
        supported_models = AiModel.objects.all()
        total = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        for model in supported_models:
            input_tokens = self.input_tokens_today(model.model_id)
            output_tokens = self.output_tokens_today(model.model_id)
            total += input_tokens * model.input_token_cost + output_tokens * model.output_token_cost
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            
            if model.is_default:
                # Add costs for chats with no specified bot (using the default model)
                input_tokens = self.input_tokens_today(None)
                output_tokens = self.output_tokens_today(None)
                total += input_tokens * model.input_token_cost + output_tokens * model.output_token_cost
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens

        return total, total_input_tokens, total_output_tokens
    
    def input_tokens_today(self, model_id):
        chats = self.chats_today(model_id)
        return chats.aggregate(models.Sum('input_tokens'))['input_tokens__sum'] or 0
    
    def output_tokens_today(self, model_id):
        chats = self.chats_today(model_id)
        return chats.aggregate(models.Sum('output_tokens'))['output_tokens__sum'] or 0
        
    def chats_today(self, model_id):
        return Chat.objects.filter(user=self.user,
                                    bot__ai_model__model_id=model_id,
                                    modified_at__gte=self.start_of_today_utc())

    def start_of_today_utc(self):
        user_timezone = pytz.timezone(self.timezone)
        today = timezone.now().astimezone(user_timezone).date()
        start_of_day = user_timezone.localize(datetime.combine(today, time.min))
        return start_of_day.astimezone(pytz.UTC)

    def _reset_baseline_applies(self):
        return (
            self.usage_reset_at is not None
            and self.usage_reset_timezone == self.timezone
            and self.usage_reset_at >= self.start_of_today_utc()
        )

    def reset_daily_usage(self):
        """Clear today's rate limit without touching Chat token history."""
        with transaction.atomic():
            account = UserAccount.objects.select_for_update().get(pk=self.pk)
            total, total_input_tokens, total_output_tokens = account._raw_cost_for_today()
            account.usage_reset_at = timezone.now()
            account.usage_reset_timezone = account.timezone
            account.usage_reset_cost = total
            account.usage_reset_input_tokens = total_input_tokens
            account.usage_reset_output_tokens = total_output_tokens
            account.save(update_fields=[
                'usage_reset_at',
                'usage_reset_timezone',
                'usage_reset_cost',
                'usage_reset_input_tokens',
                'usage_reset_output_tokens',
            ])
            self.usage_reset_at = account.usage_reset_at
            self.usage_reset_timezone = account.usage_reset_timezone
            self.usage_reset_cost = account.usage_reset_cost
            self.usage_reset_input_tokens = account.usage_reset_input_tokens
            self.usage_reset_output_tokens = account.usage_reset_output_tokens

class RevenueCatWebhookEvent(models.Model):
    raw_event = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'RevenueCat Event at {self.created_at}'