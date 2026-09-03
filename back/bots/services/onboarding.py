"""First-run onboarding bootstrap (roadmap feature 05).

Creates or updates the default profile and first bot, sets the PIN via the
existing account path (until feature 02 ships proper PIN hashing) and marks
onboarding complete — atomically and idempotently enough to retry.
"""
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from bots.models import AiModel, Bot, Profile, UserAccount
from bots.services.parent_reauth import hash_pin, validate_pin

# Defaults shown in wizard step 3; keep in sync with front/app/onboarding/bot.tsx.
DEFAULT_TEMPLATE_NAME = 'Blank'
DEFAULT_BOT_COLOR = '#2A9D8F'
DEFAULT_BOT_ICON = 'sparkles'


def _clean_pin(pin):
    """PINs are hashed at rest (roadmap 02): validate 4-8 digits, return the
    string form for hashing, or None when no PIN was supplied."""
    if pin in (None, ''):
        return None
    cleaned = str(pin)
    if not validate_pin(cleaned):
        raise ValidationError({'pin': 'PIN must be a string of 4 to 8 digits.'})
    return cleaned


def bootstrap_onboarding(user,
                         profile_name=None,
                         bot_name=None,
                         template_name=None,
                         pin=None,
                         system_prompt=None,
                         color=None,
                         icon=None):
    """Apply the wizard's choices to the account's default content.

    Matches by "default" profile / first bot so retries never duplicate rows:
    the signup signal already provisioned a profile and a Penelope bot, which
    this renames/updates in place rather than creating new ones.
    """
    profile = Profile.objects.filter(
        user=user, deleted_at=None).order_by('id').first()
    if profile is None:
        # Parent deleted the signal-provisioned default; recreate it.
        profile = Profile.objects.create(user=user, name=profile_name or '')
    elif profile_name:
        profile.name = profile_name
        profile.save()

    bot = Bot.objects.filter(user=user, deleted_at=None).order_by('id').first()
    if bot is None:
        default_model = AiModel.objects.filter(is_default=True).first()
        bot = Bot.objects.create(
            user=user,
            ai_model=default_model,
            name=bot_name or 'Penelope',
            template_name=template_name or DEFAULT_TEMPLATE_NAME,
            system_prompt=system_prompt,
        )
    else:
        changed = False
        if bot_name:
            bot.name = bot_name
            changed = True
        if template_name:
            bot.template_name = template_name
            changed = True
        if system_prompt is not None:
            bot.system_prompt = system_prompt
            changed = True
        if color:
            bot.color = color
            changed = True
        if icon:
            bot.icon = icon
            changed = True
        if changed:
            bot.save()

    account, _ = UserAccount.objects.get_or_create(user=user)
    pin_value = _clean_pin(pin)
    if pin_value is not None:
        # Same hashed storage as POST /api/user.
        account.pin_hash = hash_pin(pin_value)
    if account.onboarding_completed_at is None:
        account.onboarding_completed_at = timezone.now()
    account.save()

    return {'profile': profile, 'bot': bot}
