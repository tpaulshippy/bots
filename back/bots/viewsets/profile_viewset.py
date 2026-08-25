from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.models import Profile
from bots.permissions import IsOwner, IsParentSession
from bots.serializers import OwnProfileSerializer, ProfileSerializer
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id


class ProfileViewSet(viewsets.ModelViewSet):
    # Parent-only: teen-delegated sessions may not list/create/edit/delete
    # profiles (they get the redacted `self` endpoint below instead).
    permission_classes = [IsOwner, IsParentSession]
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

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated],
            url_path='self')
    def self_profile(self, request, *args, **kwargs):
        """Read-self endpoint for teen-delegated sessions.

        Returns only the profile this session is locked to, redacted via
        OwnProfileSerializer. Parents have no use for it (403).
        """
        if not is_teen_delegated(request.auth):
            return Response(
                {'detail': 'Only available for teen-delegated sessions.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        profile = delegated_profile_from_auth(request.auth)
        if profile is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(OwnProfileSerializer(profile).data)
