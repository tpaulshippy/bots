from rest_framework import serializers

from bots.models import Profile


class ProfileSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id',
            'profile_id',
            'name',
            'oauth_email',
            'voice_enabled',
            'deleted_at',
            'created_at',
            'modified_at']

    def validate_oauth_email(self, value):
        """Empty string means unbind; store NULL so the unique constraint
        and delegated login lookup treat the profile as unbound."""
        if value is not None and value.strip() == '':
            return None
        return value

class ProfileIdSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = ['id', 'profile_id', 'name', 'url']


class OwnProfileSerializer(serializers.ModelSerializer):
    """Redacted profile for teen-delegated sessions: no oauth_email and no
    parent-only fields."""

    class Meta:
        model = Profile
        fields = ['id', 'profile_id', 'name']
