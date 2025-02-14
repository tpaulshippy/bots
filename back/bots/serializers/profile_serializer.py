from rest_framework import serializers
from bots.models import Profile

class ProfileSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id',
            'profile_id',
            'name',
            'deleted_at',
            'created_at',
            'modified_at']

class ProfileIdSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = ['id', 'profile_id', 'name', 'url'] 