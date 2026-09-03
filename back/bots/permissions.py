from rest_framework.permissions import SAFE_METHODS, BasePermission

from bots.services.parent_reauth import (
    PARENT_REAUTH_HEADER,
    has_valid_parent_reauth,
    is_teen_delegated,
)


class IsOwner(BasePermission):
    """
    Check if the user is the owner of the object.
    """
    def has_object_permission(self, request, view, obj):
        # Check for different ownership patterns
        from bots.models import Deck, Flashcard

        if isinstance(obj, Deck):
            # Deck is owned via profile.user
            return hasattr(obj, 'profile') and obj.profile and obj.profile.user == request.user
        elif isinstance(obj, Flashcard):
            # Flashcard is owned via deck.profile.user
            return hasattr(obj, 'deck') and hasattr(obj.deck, 'profile') and obj.deck.profile and obj.deck.profile.user == request.user
        # Default: check for user field
        return hasattr(obj, 'user') and obj.user == request.user


def _is_teen_delegated(request):
    """True when the request's JWT is a teen-delegated parent session."""
    auth = getattr(request, 'auth', None)
    return bool(auth is not None and auth.get('is_teen_delegated'))


class IsParentSession(BasePermission):
    """Deny the request entirely if the JWT is a teen-delegated session.

    Used on parent-only surfaces (profile management, account/PIN changes,
    account deletion) that a teen device must never reach, even with a
    malicious client.
    """

    def has_permission(self, request, view):
        return not _is_teen_delegated(request)


class IsParentSessionForWrites(BasePermission):
    """Allow teen-delegated sessions to read but never to write.

    Used on BotViewSet: teens need to read (and chat with) their family's
    bots, but only parents may create or edit them.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return not _is_teen_delegated(request)


class ParentReauthRequired(BasePermission):
    """Gate unsafe methods behind a recent parent reauthentication.

    Reads stay open (kid paths list/read bots and profiles for chat), but any
    create/update/delete requires the `X-Parent-Reauth` header issued by
    `POST /api/auth/reauthenticate` within the reauth TTL. Teen-delegated
    sessions are always denied.
    """
    message = f'Parent reauthentication required. Send a valid {PARENT_REAUTH_HEADER} header.'

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        if is_teen_delegated(request):
            return False
        return has_valid_parent_reauth(request)

