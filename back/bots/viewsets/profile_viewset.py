from rest_framework import viewsets, serializers
from bots.models import Profile
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

class ProfileViewSet(viewsets.ReadOnlyModelViewSet):
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
            return Profile.objects.get(profile_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            return Profile.objects.get(id=lookup_field_value)
