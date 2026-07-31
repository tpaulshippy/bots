from rest_framework import viewsets

from bots.models import Device
from bots.permissions import IsOwner
from bots.serializers import DeviceSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class DeviceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    
    def get_queryset(self):
        notification_token = self.request.query_params.get('notificationToken')

        user = self.request.user
        if user.is_anonymous:
            return Device.objects.none()
        if notification_token:
            return Device.objects.filter(user=user, notification_token=notification_token)
        return Device.objects.filter(user=user, deleted_at=None)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        device = get_object_by_uuid_or_id(Device.objects.all(), 'device_id', lookup_field_value)

        self.check_object_permissions(self.request, device)
        return device

    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
