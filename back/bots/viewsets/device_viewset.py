from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from bots.models import Device
from bots.permissions import IsOwner
from bots.serializers import DeviceSerializer
import uuid

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
            return Device.objects.filter(notification_token=notification_token)
        return Device.objects.filter(user=user, deleted_at=None)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            device = Device.objects.get(device_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            device = Device.objects.get(id=lookup_field_value)
        except Device.DoesNotExist:
            raise NotFound(f"Device with {self.lookup_field}={lookup_field_value} does not exist")
            
        self.check_object_permissions(self.request, device)
        return device

    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
