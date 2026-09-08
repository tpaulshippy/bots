"""First-run onboarding bootstrap (roadmap feature 05).

Creates or updates the default profile and first bot, sets the PIN (optional
— PIN-less accounts are supported, see PIN opt-out) and marks onboarding
complete — atomically and idempotently enough to retry.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
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
    string form for hashing, or None when no PIN was supplied (PIN-less)."""
    if pin in (None, ''):
        return None
    cleaned = str(pin).strip()
    if cleaned == '':
        return None
    if not validate_pin(cleaned):
        raise ValidationError({'pin': 'PIN must be a string of 4 to 8 digits.'})
    return cleaned


def _clean_profile_name(profile_name):
    """Strip the wizard name; None means "leave unchanged", blank means 400.

    The Profile model has no `blank=True`, so persisting '' would create an
    empty-string profile. The wizard blocks empty names client-side; the
    server rejects them so API callers can't create one either.
    """
    if profile_name is None:
        return None
    cleaned = str(profile_name).strip()
    if cleaned == '':
        raise ValidationError({'profileName': 'Profile name must not be blank.'})
    return cleaned


def _clean_student_email(student_email):
    """Normalize the optional student email for teen self-login.

    Empty/None unbinds to None (same convention as ProfileSerializer);
    otherwise lowercase/trim and validate format. Uniqueness is enforced by
    the DB constraint — callers map IntegrityError to a 400.
    """
    if student_email is None:
        return None
    stripped = str(student_email).strip()
    if stripped == '':
        return None
    normalized = stripped.lower()
    try:
        validate_email(normalized)
    except DjangoValidationError:
        raise ValidationError({'studentEmail': 'Enter a valid email address.'})
    return normalized


@transaction.atomic
def bootstrap_onboarding(user,
                         profile_name=None,
                         bot_name=None,
                         template_name=None,
                         pin=None,
                         system_prompt=None,
                         color=None,
                         icon=None,
                         student_email=None):
    """Apply the wizard's choices to the account's default content.

    Matches by "default" profile / first bot so retries never duplicate rows:
    the signup signal already provisioned a profile and a Penelope bot, which
    this renames/updates in place rather than creating new ones.

    PIN is validated first so a 400 never leaves half-applied renames behind.
    PIN-less (pin=None/'') completes onboarding without setting a PIN.
    """
    # Validate everything up front: invalid PIN / name / email must 400
    # before any profile or bot row is touched.
    pin_value = _clean_pin(pin)
    cleaned_name = _clean_profile_name(profile_name)
    cleaned_email = _clean_student_email(student_email)

    profile = Profile.objects.filter(
        user=user, deleted_at=None).order_by('id').first()
    if profile is None:
        # Parent deleted the signal-provisioned default; recreate it. A name
        # is required here — persisting '' would create a blank profile
        # (Profile has no blank=True), so omit/blank names 400 instead.
        if not cleaned_name:
            raise ValidationError(
                {'profileName': 'Profile name must not be blank.'})
        try:
            profile = Profile.objects.create(
                user=user,
                name=cleaned_name,
                oauth_email=cleaned_email,
            )
        except IntegrityError:
            raise ValidationError(
                {'studentEmail': 'That email is already used by another profile.'})
    else:
        changed = False
        if cleaned_name:
            profile.name = cleaned_name
            changed = True
        if student_email is not None:
            # Explicit param (even ''/None) means rebind/unbind.
            profile.oauth_email = cleaned_email
            changed = True
        if changed:
            try:
                profile.save()
            except IntegrityError:
                raise ValidationError(
                    {'studentEmail': 'That email is already used by another profile.'})

    bot = Bot.objects.filter(user=user, deleted_at=None).order_by('id').first()
    if bot is None:
        default_model = AiModel.objects.filter(is_default=True).first()
        bot = Bot.objects.create(
            user=user,
            ai_model=default_model,
            name=bot_name or 'Penelope',
            template_name=template_name or DEFAULT_TEMPLATE_NAME,
            system_prompt=system_prompt,
            color=color or DEFAULT_BOT_COLOR,
            icon=icon or DEFAULT_BOT_ICON,
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
    if pin_value is not None:
        # Same hashed storage as POST /api/user.
        account.pin_hash = hash_pin(pin_value)
    if account.onboarding_completed_at is None:
        account.onboarding_completed_at = timezone.now()
    account.save()

    return {'profile': profile, 'bot': bot}
