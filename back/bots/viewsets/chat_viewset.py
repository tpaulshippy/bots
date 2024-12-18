from rest_framework import viewsets, serializers

from bots.models import Chat, Message
import uuid

class MessageSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Message
        fields = [
            'id', 
            'chat_id',
            'message_id', 
            'order', 
            'role', 
            'text', 
            'input_tokens',
            'output_tokens',
            'created_at', 
            'modified_at']

class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    
    def get_queryset(self):
        chat_id = self.kwargs['chat_pk']  # Extract chat ID from the URL
        return Message.objects.filter(chat_id=chat_id)
    

class ChatListSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Chat
        fields = ['id', 'chat_id', 'title', 'created_at', 'modified_at', 'url']

class ChatSerializer(serializers.HyperlinkedModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 'chat_id', 'title', 'messages', 'created_at', 'modified_at']

class ChatViewSet(viewsets.ReadOnlyModelViewSet):
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
