from rest_framework import viewsets, serializers
from django.db.models import Count
from bots.models import Chat, Message, Profile, Bot
from bots.permissions import IsOwner
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
        user = self.request.user
        chat_id = self.kwargs['chat_pk']  # Extract chat ID from the URL
        
        queryset = Chat.objects.filter(user=user).get(chat_id=chat_id).messages
        queryset = queryset.exclude(role='system')
        
        return queryset

class ProfileIdSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Profile
        fields = ['profile_id', 'name', 'url']

class BotSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Bot
        fields = ['bot_id', 'name', 'url']

class ChatListSerializer(serializers.HyperlinkedModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    profile = ProfileIdSerializer(read_only=True)
    bot = BotSerializer(read_only=True)

    class Meta:
        model = Chat
        fields = ['id', 
                  'chat_id', 
                  'profile',
                  'bot',
                  'title', 
                  'message_count',
                  'input_tokens',
                  'output_tokens',
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
                  'input_tokens',
                  'output_tokens',
                  'created_at', 
                  'modified_at']

class ChatViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsOwner]
    queryset = Chat.objects.all()
    
    def get_queryset(self):
        user = self.request.user
        profile_id = self.request.query_params.get('profileId')
        queryset = Chat.objects.filter(user=user)
        if profile_id:
            queryset = queryset.filter(profile__profile_id=profile_id)

        return queryset.annotate(message_count=Count('messages')).order_by('-id')

    def get_serializer_class(self):
        if self.action == 'list':
            return ChatListSerializer
        return ChatSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            # Check if the lookup field value is a valid UUID
            uuid.UUID(lookup_field_value)
            chat = Chat.objects.get(chat_id=lookup_field_value)
        except ValueError:
            # If not a valid UUID, treat it as an id
            chat = Chat.objects.get(id=lookup_field_value)

        self.check_object_permissions(self.request, chat)
        return chat

