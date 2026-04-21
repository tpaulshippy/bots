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
