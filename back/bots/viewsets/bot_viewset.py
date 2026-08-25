from rest_framework import viewsets

from bots.models import Bot, Profile
from bots.permissions import IsOwner
from bots.serializers import BotSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class BotViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Bot.objects.all()
    serializer_class = BotSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.is_anonymous:
            return Bot.objects.none()
        
        qs = Bot.objects.filter(user=user, deleted_at=None).order_by('name')

        # roadmap-09: when profileId is provided, filter to only the
        # bots the profile is allowed to use.  Without the param, return
        # all account bots (parent / admin view).
        profile_id = self.request.query_params.get('profileId')
        if profile_id:
            try:
                import uuid as _uuid
                profile = Profile.objects.get(profile_id=_uuid.UUID(profile_id), user=user, deleted_at=None)
            except (Profile.DoesNotExist, ValueError):
                return qs.none()
            if profile.access_mode == 'allowlist':
                allowed_ids = profile.allowed_bots.values_list('id', flat=True)
                qs = qs.filter(id__in=allowed_ids)
            # access_mode == "all" → return full queryset (no extra filter)

        return qs

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        bot = get_object_by_uuid_or_id(Bot.objects.all(), 'bot_id', lookup_field_value)

        self.check_object_permissions(self.request, bot)
        return bot
    
    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
