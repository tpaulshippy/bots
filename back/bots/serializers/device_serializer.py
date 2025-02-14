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
            'deleted_at',
            'created_at',
            'modified_at',
            'url'] 