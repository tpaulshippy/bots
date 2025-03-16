from rest_framework import viewsets
from django.db.models import Count
from bots.models import Chat, Message
from bots.permissions import IsOwner
from bots.serializers import (
    ChatSerializer, 
    ChatListSerializer, 
    MessageSerializer
)
import uuid

class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer

    def get_queryset(self):
        user = self.request.user
        chat_id = self.kwargs['chat_pk']  # Extract chat ID from the URL
        
        queryset = Chat.objects.filter(user=user).get(chat_id=chat_id).messages
        queryset = queryset.exclude(role='system').order_by('id')
        
        return queryset

class ChatViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsOwner]
    queryset = Chat.objects.all()
    
    def get_queryset(self):
        user = self.request.user
        profile_id = self.request.query_params.get('profileId')
        queryset = Chat.objects.filter(user=user)
        if profile_id:
            queryset = queryset.filter(profile__profile_id=profile_id)
        
        app_id = self.request.headers.get('x-app-id', 1)
        queryset = queryset.filter(bot__app_id=app_id)

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
