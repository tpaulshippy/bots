from django.db.models import Count
from rest_framework import viewsets

from bots.models import Chat, Message
from bots.permissions import IsOwner
from bots.serializers import ChatListSerializer, ChatSerializer, MessageSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer

    def get_queryset(self):
        user = self.request.user
        chat_id = self.kwargs['chat_pk']  # Extract chat ID from the URL

        chat = get_object_by_uuid_or_id(Chat.objects.filter(user=user), 'chat_id', chat_id)
        queryset = chat.messages
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

        return queryset.annotate(message_count=Count('messages')).order_by('-modified_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return ChatListSerializer
        return ChatSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        chat = get_object_by_uuid_or_id(Chat.objects.all(), 'chat_id', lookup_field_value)

        self.check_object_permissions(self.request, chat)
        return chat
