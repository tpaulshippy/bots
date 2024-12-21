from rest_framework import viewsets, serializers
from django.db.models import Count
from bots.models import Chat, Message, Profile
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
    

class ProfileIdSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = ['profile_id', 'url']

class ChatListSerializer(serializers.HyperlinkedModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    profile = ProfileIdSerializer(read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 
                  'chat_id', 
                  'profile',
                  'title', 
                  'message_count', 
                  'created_at', 
                  'modified_at', 
                  'url']

class ChatSerializer(serializers.HyperlinkedModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 
                  'chat_id',
                  'profile',
                  'title', 
                  'messages', 
                  'created_at', 
                  'modified_at']

class ChatViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Chat.objects.annotate(message_count=Count('messages')).order_by('-id')

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
