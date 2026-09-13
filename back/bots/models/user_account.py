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

# Version of the cost computation that reset baselines are stamped with.
# 1 = pre-0055 lifetime Chat counters grouped by live bot model (legacy);
# 2 = message-based totals grouped by stamped model_id. Baselines from an
# older version are never subtracted (see usage_reset_version).
USAGE_RESET_VERSION = 2

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
    # usage_reset_version guards the same way across computation changes:
    # baselines stamped by an older cost computation (e.g. pre-0055 Chat
    # lifetime counters vs. message-based totals) are ignored rather than
    # subtracted from a total measured on a different basis. A stale
    # baseline could otherwise exceed the new raw total and clamp usage to
    # zero for the rest of the day.
    usage_reset_version = models.IntegerField(default=1)
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
        models_by_id = {m.model_id: m for m in AiModel.objects.all()}
        default_model = next((m for m in models_by_id.values() if m.is_default), None)

        def price(model_id):
            # A stamp for a deleted model row (or a bot-less unstamped chat
            # with no default configured) bills at default rates rather
            # than silently dropping real spend; with no default at all it
            # bills zero, matching the pre-fix behavior for bot-less chats.
            model = models_by_id.get(model_id) or default_model
            if model is None:
                return (0.0, 0.0)
            return (model.input_token_cost, model.output_token_cost)

        stamped, unstamped = self._message_buckets_today()
        total = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        for bucket in (stamped, unstamped):
            for model_id, (input_tokens, output_tokens) in bucket.items():
                rate_in, rate_out = price(model_id)
                total += input_tokens * rate_in + output_tokens * rate_out
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens

        return total, total_input_tokens, total_output_tokens

    def _message_buckets_today(self):
        """Per-model (input, output) sums over today's assistant messages.

        Returns (stamped, unstamped) dicts mapping model_id -> [in, out].
        Stamped rows group by the model_id written at persist time, so later
        bot model changes cannot reprice history. Unstamped rows (pre-fix,
        or chats whose bot was deleted) group by the chat's live bot model —
        the pre-fix behavior — with None for bot-less chats (default rates).
        """
        from .message import Message

        base = Message.objects.filter(
            chat__user=self.user,
            role='assistant',
            created_at__gte=self.start_of_today_utc(),
        )
        stamped_rows = (
            base.exclude(model_id__isnull=True).exclude(model_id='')
            .values('model_id')
            .annotate(total_in=models.Sum('input_tokens'), total_out=models.Sum('output_tokens'))
        )
        stamped = {
            row['model_id']: [row['total_in'] or 0, row['total_out'] or 0]
            for row in stamped_rows
        }
        unstamped_rows = (
            base.filter(models.Q(model_id__isnull=True) | models.Q(model_id=''))
            .values('chat__bot__ai_model__model_id')
            .annotate(total_in=models.Sum('input_tokens'), total_out=models.Sum('output_tokens'))
        )
        unstamped = {
            row['chat__bot__ai_model__model_id']: [row['total_in'] or 0, row['total_out'] or 0]
            for row in unstamped_rows
        }
        return stamped, unstamped

    def _message_tokens_today(self, model_id):
        stamped, unstamped = self._message_buckets_today()
        total_in, total_out = unstamped.get(model_id, [0, 0])
        if model_id is not None:
            stamped_in, stamped_out = stamped.get(model_id, [0, 0])
            total_in += stamped_in
            total_out += stamped_out
        return total_in, total_out

    def input_tokens_today(self, model_id):
        return self._message_tokens_today(model_id)[0]

    def output_tokens_today(self, model_id):
        return self._message_tokens_today(model_id)[1]

    def start_of_today_utc(self):
        user_timezone = pytz.timezone(self.timezone)
        today = timezone.now().astimezone(user_timezone).date()
        start_of_day = user_timezone.localize(datetime.combine(today, time.min))
        return start_of_day.astimezone(pytz.UTC)

    def _reset_baseline_applies(self):
        return (
            self.usage_reset_at is not None
            and self.usage_reset_timezone == self.timezone
            and self.usage_reset_version == USAGE_RESET_VERSION
            and self.usage_reset_at >= self.start_of_today_utc()
        )

    def reset_daily_usage(self):
        """Clear today's rate limit without touching Chat token history."""
        with transaction.atomic():
            account = UserAccount.objects.select_for_update().get(pk=self.pk)
            # Single timestamp captured before the snapshot: if local
            # midnight falls during the snapshot, the stamp predates it and
            # the baseline is conservatively ignored (never subtracted from
            # the wrong day's usage).
            reset_at = timezone.now()
            total, total_input_tokens, total_output_tokens = account._raw_cost_for_today()
            account.usage_reset_at = reset_at
            account.usage_reset_timezone = account.timezone
            account.usage_reset_cost = total
            account.usage_reset_input_tokens = total_input_tokens
            account.usage_reset_output_tokens = total_output_tokens
            account.usage_reset_version = USAGE_RESET_VERSION
            account.save(update_fields=[
                'usage_reset_at',
                'usage_reset_timezone',
                'usage_reset_cost',
                'usage_reset_input_tokens',
                'usage_reset_output_tokens',
                'usage_reset_version',
            ])
            self.usage_reset_at = account.usage_reset_at
            self.usage_reset_timezone = account.usage_reset_timezone
            self.usage_reset_cost = account.usage_reset_cost
            self.usage_reset_input_tokens = account.usage_reset_input_tokens
            self.usage_reset_output_tokens = account.usage_reset_output_tokens
            self.usage_reset_version = account.usage_reset_version

class RevenueCatWebhookEvent(models.Model):
    raw_event = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'RevenueCat Event at {self.created_at}'