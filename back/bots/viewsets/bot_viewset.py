from rest_framework import viewsets, serializers
from bots.models import Bot
from bots.permissions import IsOwner
import uuid

class BotSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Bot
        fields = [
            'id',
            'bot_id',
            'name',
            'model',
            'system_prompt',
            'simple_editor',
            'template_name',
            'response_length',
            'restrict_adult_topics',
            'restrict_language',
            'created_at',
            'modified_at',
            'deleted_at',
            'url']

class BotViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    queryset = Bot.objects.all()
    serializer_class = BotSerializer
    
    def get_queryset(self):
        user = self.request.user
        return Bot.objects.filter(user=user, deleted_at=None)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            bot = Bot.objects.get(bot_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            bot = Bot.objects.get(id=lookup_field_value)
            
        self.check_object_permissions(self.request, bot)
        return bot
    
    def perform_create(self, serializer):
        # Set the user before saving the object
        serializer.save(user=self.request.user)
