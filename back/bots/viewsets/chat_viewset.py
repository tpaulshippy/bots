from rest_framework import viewsets, permissions, serializers
from bots.models import Chat, Message
import uuid

class MessageSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'message_id', 'order', 'role', 'text', 'created_at', 'modified_at']

class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer


class ChatListSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Chat
        fields = ['id', 'chat_id', 'title', 'created_at', 'modified_at']

class ChatSerializer(serializers.HyperlinkedModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 'chat_id', 'title', 'messages', 'created_at', 'modified_at']

class ChatViewSet(viewsets.ModelViewSet):
    queryset = Chat.objects.all()
    def get_serializer_class(self):
        if self.action == 'list':
            return ChatListSerializer
        return ChatSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            return Chat.objects.get(chat_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            return Chat.objects.get(id=lookup_field_value)
