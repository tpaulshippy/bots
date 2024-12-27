from rest_framework.permissions import BasePermission

class IsOwner(BasePermission):
    """
    Check if the user is the owner of the object.
    """
    def has_object_permission(self, request, view, obj):
        # Assuming the model has a 'user' field pointing to the owner
        return obj.user == request.user
