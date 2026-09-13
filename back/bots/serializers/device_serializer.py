from rest_framework import serializers

from bots.models import Device


class DeviceSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Device
        fields = [
            'id',
            'device_id',
            'notification_token',
            'notify_on_new_chat',
            'notify_on_new_message',
            'notify_digest_only',
            'notify_study_due',
            'deleted_at',
            'created_at',
            'modified_at',
            'url']
        # No UniqueValidator on notification_token: uniqueness is enforced
        # in DeviceViewSet.perform_create, which must first check for a
        # soft-deleted row to revive (the validator sees deleted rows and
        # would 400 a legitimate re-registration before the view runs).
        extra_kwargs = {
            'notification_token': {'validators': []},
        } 