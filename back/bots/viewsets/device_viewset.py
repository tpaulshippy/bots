import uuid

from rest_framework import viewsets
from rest_framework.exceptions import NotFound, PermissionDenied

from bots.models import Device
from bots.permissions import IsOwner
from bots.serializers import DeviceSerializer
from bots.tokens import is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id

# Device fields a teen-delegated session may never change. Teens get their
# own opt-in (notify_study_due) on a teen-safe screen, but the parent
# surveillance flags — and device identity — stay parent-only so a crafted
# client can't silently disable oversight or reassign/remove devices.
TEEN_IMMUTABLE_DEVICE_FIELDS = frozenset({
    'notification_token',
    'notify_on_new_chat',
    'notify_on_new_message',
    'notify_digest_only',
    'deleted_at',
})

# Serializer noise that round-trips on every PUT but is read-only
# server-side; never counts as a teen "change".
READ_ONLY_DEVICE_FIELDS = frozenset({
    'id', 'device_id', 'created_at', 'modified_at', 'url',
})


def _field_unchanged(current, incoming):
    """Loose equality for round-tripped values (bool vs "true", None vs "")."""
    if current is None:
        return incoming is None or incoming == ''
    if isinstance(current, bool):
        if isinstance(incoming, bool):
            return current == incoming
        if isinstance(incoming, str):
            return current == incoming.lower() in ('true', '1')
        return False
    return str(current) == str(incoming)


class DeviceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer
    
    def get_queryset(self):
        notification_token = self.request.query_params.get('notificationToken')

        user = self.request.user
        if user.is_anonymous:
            return Device.objects.none()
        if is_teen_delegated(self.request.auth):
            # Teens may only look up their own physical device by its push
            # token. An unfiltered list would enumerate every device id and
            # notification token on the parent account (push targets); device
            # UUIDs are the only other address, and both are unguessable, so
            # token lookup plus retrieve-by-id is all a teen client needs.
            if notification_token:
                return Device.objects.filter(user=user, notification_token=notification_token)
            return Device.objects.none()
        if notification_token:
            return Device.objects.filter(user=user, notification_token=notification_token)
        return Device.objects.filter(user=user, deleted_at=None)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        if is_teen_delegated(self.request.auth):
            # Teen detail routes are UUID-only: integer pks are sequential
            # and brute-forceable, which would re-open the enumeration just
            # closed on the list route. All teen clients address their own
            # record by device UUID (see upsertDevice).
            try:
                uuid.UUID(str(lookup_field_value))
            except ValueError:
                raise NotFound('Device not found')

        device = get_object_by_uuid_or_id(Device.objects.all(), 'device_id', lookup_field_value)

        self.check_object_permissions(self.request, device)
        return device

    def perform_create(self, serializer):
        # Set the user before saving the object
        if is_teen_delegated(self.request.auth):
            # A teen registering their device must not alter the parent
            # surveillance posture: parent-only flags are forced off no
            # matter what a crafted client sends, so a first-time teen
            # registration can never opt into per-chat/per-message pushes
            # (which carry profile names and message text, possibly a
            # sibling's). Only the teen's own study-reminder opt-in is
            # honored as given. A parent can still enable pushes for that
            # device later from parent Settings.
            serializer.save(
                user=self.request.user,
                notify_on_new_chat=False,
                notify_on_new_message=False,
                notify_digest_only=False,
                deleted_at=None,
            )
            return
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        if is_teen_delegated(self.request.auth):
            self._enforce_teen_update(serializer.instance, self.request.data)
        serializer.save()

    def perform_destroy(self, instance):
        if is_teen_delegated(self.request.auth):
            raise PermissionDenied(
                'Teen-delegated sessions cannot delete devices.'
            )
        instance.delete()

    @staticmethod
    def _enforce_teen_update(device, data):
        """Teens may only flip notify_study_due; every other writable field
        must round-trip unchanged (the teen client sends the full object, so
        identical values pass). Anything else is a crafted evasion attempt."""
        if not isinstance(data, dict):
            raise PermissionDenied(
                'Teen-delegated sessions may only change Study reminders.'
            )
        for field in TEEN_IMMUTABLE_DEVICE_FIELDS:
            if field in data and not _field_unchanged(
                getattr(device, field), data[field]
            ):
                raise PermissionDenied(
                    'Teen-delegated sessions may only change Study reminders '
                    f'(blocked change to {field}).'
                )
