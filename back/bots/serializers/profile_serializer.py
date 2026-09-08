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
            'deleted_at',
            'created_at',
            'modified_at']

    def validate_oauth_email(self, value):
        """Empty string means unbind; store NULL so the unique constraint
        and delegated login lookup treat the profile as unbound. Stored
        lowercased/trimmed so the iexact delegated lookup can't match two
        active profiles bound with different casing."""
        if value is None:
            return None
        stripped = value.strip()
        if stripped == '':
            return None
        normalized = stripped.lower()
        # Surface the partial-unique DB constraint as a 400 instead of a 500:
        # one active profile per teen sign-in email (soft-deleted rows don't
        # count; the row being updated doesn't count against itself).
        conflict = Profile.objects.filter(
            oauth_email=normalized, deleted_at=None)
        if self.instance is not None:
            conflict = conflict.exclude(pk=self.instance.pk)
        if conflict.exists():
            raise serializers.ValidationError(
                'That email is already used by another profile.')
        return normalized

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
