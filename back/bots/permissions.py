from rest_framework.permissions import BasePermission


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


class IsParentSession(BasePermission):
    """
    Allow only authenticated parent sessions; reject teen-delegated sessions.

    Teen sessions (roadmap 01) carry a `session_type: "teen"` claim in their
    JWT. They must never open the parent Activity inbox, even though the
    underlying chats are scoped to the account owner.
    """
    message = 'Teen sessions cannot access the parent activity area.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        payload = getattr(request.auth, 'payload', None)
        if isinstance(payload, dict) and payload.get('session_type') == 'teen':
            return False
        return True
