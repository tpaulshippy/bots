from rest_framework.permissions import BasePermission

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
