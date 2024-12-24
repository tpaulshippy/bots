from rest_framework import viewsets, serializers
from bots.models import Bot
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
            'created_at',
            'modified_at']

class BotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Bot.objects.all()
    serializer_class = BotSerializer
    
    def get_queryset(self):
        user = self.request.user
        return Bot.objects.filter(user=user)

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            return Bot.objects.get(bot_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            return Bot.objects.get(id=lookup_field_value)
