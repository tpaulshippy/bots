"""PIN verification and short-lived parent reauth sessions.

Implements docs/roadmap/02-pin-security-and-reauth.md:
- PINs are hashed at rest and never returned by the API.
- `POST /api/auth/reauthenticate` verifies the PIN and returns a signed,
  short-lived parent capability token (Option A in the spec).
- Parent mutations require the `X-Parent-Reauth` header with a valid token.
- After MAX_PIN_FAILURES wrong attempts the account is locked for
  PIN_LOCKOUT_MINUTES minutes.
"""
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework_simplejwt.settings import api_settings as jwt_api_settings
from rest_framework_simplejwt.tokens import AccessToken

PARENT_REAUTH_HEADER = 'X-Parent-Reauth'

PIN_MIN_LENGTH = 4
PIN_MAX_LENGTH = 8

MAX_PIN_FAILURES = 5
PIN_LOCKOUT_MINUTES = 15

# How long a successful reauthentication unlocks parent controls.
PARENT_REAUTH_TTL = timedelta(minutes=15)


class ParentReauthToken(AccessToken):
    """Short-lived JWT carrying the `parent_reauth` capability claim."""

    lifetime = PARENT_REAUTH_TTL

    def __init__(self, token=None, verify=True):
        super().__init__(token, verify)
        if token is None:
            self['parent_reauth'] = True


def validate_pin(pin) -> bool:
    """A valid PIN is a string of PIN_MIN_LENGTH..PIN_MAX_LENGTH digits."""
    return (
        isinstance(pin, str)
        and pin.isdigit()
        and PIN_MIN_LENGTH <= len(pin) <= PIN_MAX_LENGTH
    )


def hash_pin(pin: str) -> str:
    return make_password(pin)


def verify_pin(account, pin: str) -> bool:
    return bool(account.pin_hash) and check_password(pin, account.pin_hash)


def is_pin_locked(account) -> bool:
    until = account.pin_locked_until
    return bool(until) and until > timezone.now()


def register_pin_failure(account):
    """Count a wrong PIN attempt; lock the account at MAX_PIN_FAILURES."""
    account.pin_failed_attempts += 1
    if account.pin_failed_attempts >= MAX_PIN_FAILURES:
        account.pin_locked_until = timezone.now() + timedelta(minutes=PIN_LOCKOUT_MINUTES)
    else:
        account.pin_locked_until = None
    account.save(update_fields=['pin_failed_attempts', 'pin_locked_until'])


def reset_pin_failures(account):
    if account.pin_failed_attempts or account.pin_locked_until:
        account.pin_failed_attempts = 0
        account.pin_locked_until = None
        account.save(update_fields=['pin_failed_attempts', 'pin_locked_until'])


def remaining_attempts(account) -> int:
    return max(0, MAX_PIN_FAILURES - account.pin_failed_attempts)


def issue_parent_session_token(user):
    """Return (token string, expiry datetime) for a fresh parent session."""
    token = ParentReauthToken.for_user(user)
    expires_at = timezone.now() + PARENT_REAUTH_TTL
    return str(token), expires_at


def _request_token_claims(request):
    auth = getattr(request, 'auth', None)
    payload = getattr(auth, 'payload', None)
    return payload if isinstance(payload, dict) else {}


def has_valid_parent_reauth(request) -> bool:
    """True when the request carries a valid parent session token.

    The token must be a well-formed ParentReauthToken for the same user that
    is authenticated on the request. Teen-delegated access tokens can never
    satisfy it (and their bearers are denied parent writes outright).
    """
    header_token = request.headers.get(PARENT_REAUTH_HEADER)
    if not header_token:
        return False

    try:
        token = ParentReauthToken(header_token)
    except Exception:
        return False

    # A regular login access token shares the 'access' token_type, so the
    # capability claim itself must be verified as well.
    if token.get('parent_reauth') is not True:
        return False

    user_id_claim = jwt_api_settings.USER_ID_CLAIM
    user = getattr(request, 'user', None)
    if user is None or user.is_anonymous:
        return False
    return str(token.get(user_id_claim)) == str(getattr(user, 'pk', None))


def is_teen_delegated(request) -> bool:
    """True when the request's auth JWT belongs to a teen-delegated session."""
    return bool(_request_token_claims(request).get('is_teen_delegated'))
