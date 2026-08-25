from rest_framework import viewsets

from bots.models import Bot
from bots.permissions import IsOwner, ParentReauthRequired
from bots.serializers import BotSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class BotViewSet(viewsets.ModelViewSet):
    # Reads stay open for kid paths; writes need a parent reauth session.
    permission_classes = [IsOwner, ParentReauthRequired]
    queryset = Bot.objects.all()
    serializer_class = BotSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.is_anonymous:
            return Bot.objects.none()
        
        return Bot.objects.filter(user=user, deleted_at=None).order_by('name')

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        bot = get_object_by_uuid_or_id(Bot.objects.all(), 'bot_id', lookup_field_value)

        self.check_object_permissions(self.request, bot)
        return bot
    
    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
