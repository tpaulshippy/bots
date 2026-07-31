from rest_framework import viewsets

from bots.models import Profile
from bots.permissions import IsOwner
from bots.serializers import ProfileSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class ProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.is_anonymous:
            return Profile.objects.none()
        return Profile.objects.filter(user=user, deleted_at=None).order_by('name')

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        profile = get_object_by_uuid_or_id(Profile.objects.all(), 'profile_id', lookup_field_value)
        self.check_object_permissions(self.request, profile)
        return profile

    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
