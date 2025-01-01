from rest_framework import viewsets, serializers
from bots.models import Profile
from bots.permissions import IsOwner
import uuid

class ProfileSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id',
            'profile_id',
            'name',
            'created_at',
            'modified_at']

class ProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    
    def get_queryset(self):
        user = self.request.user
        return Profile.objects.filter(user=user)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            profile = Profile.objects.get(profile_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            profile = Profile.objects.get(id=lookup_field_value)
        self.check_object_permissions(self.request, profile)
        return profile

    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
