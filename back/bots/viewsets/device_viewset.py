import uuid

from rest_framework import viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

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
            # Soft-deleted rows are excluded (as in the parent list): a
            # re-registering device revives via create instead of
            # resurrecting a dead row through update.
            if notification_token:
                return Device.objects.filter(
                    user=user, notification_token=notification_token, deleted_at=None
                )
            return Device.objects.none()
        if notification_token:
            return Device.objects.filter(
                user=user, notification_token=notification_token, deleted_at=None
            )
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

        # Soft-deleted rows are invisible here, as in the lists: otherwise a
        # cached device_id could GET/PUT a dead row, preserving deleted_at
        # while the device stays out of parent lists and delivery queries.
        # Recovery is via create, which revives the row.
        device = get_object_by_uuid_or_id(
            Device.objects.filter(deleted_at=None), 'device_id', lookup_field_value
        )

        self.check_object_permissions(self.request, device)
        return device

    def perform_create(self, serializer):
        user = self.request.user
        # Re-registration of a soft-deleted device revives the same row
        # (preserving its device_id) instead of colliding on the unique
        # notification token — and instead of the old flow where a token
        # lookup returned the dead row and clients PUT it back unchanged,
        # leaving it deleted (and reminder-less) forever. Requested flags
        # apply with the same teen rules as fresh creates below.
        token = serializer.validated_data.get('notification_token')
        if token:
            deleted = Device.objects.filter(
                user=user, notification_token=token, deleted_at__isnull=False
            ).first()
            if deleted is not None:
                for attr, value in serializer.validated_data.items():
                    setattr(deleted, attr, value)
                if is_teen_delegated(self.request.auth):
                    deleted.notify_on_new_chat = False
                    deleted.notify_on_new_message = False
                    deleted.notify_digest_only = False
                deleted.user = user
                deleted.deleted_at = None
                deleted.save()
                serializer.instance = deleted
                return
            # No soft-deleted row to revive: a live row with this token
            # (any account — the old UniqueValidator behaved globally) is a
            # genuine duplicate, rejected as a 400 instead of hitting the DB
            # constraint as a 500.
            if Device.objects.filter(notification_token=token).exists():
                raise ValidationError({
                    'notification_token': 'Device with this notification token already exists.'
                })
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
        # The table-wide UniqueValidator was dropped from the serializer so
        # creates can revive soft-deleted rows; the update path replaces it
        # here so retargeting a live device onto another live device's
        # token stays a clean 400 instead of a DB-constraint 500.
        token = serializer.validated_data.get('notification_token')
        if (
            token
            and Device.objects.filter(notification_token=token)
            .exclude(pk=serializer.instance.pk)
            .exists()
        ):
            raise ValidationError({
                'notification_token': 'Device with this notification token already exists.'
            })
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
