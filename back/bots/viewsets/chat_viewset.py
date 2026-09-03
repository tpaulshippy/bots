from django.db.models import Count
from rest_framework import viewsets

from bots.models import Chat, Message
from bots.permissions import IsOwner
from bots.serializers import ChatListSerializer, ChatSerializer, MessageSerializer
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer

    def get_queryset(self):
        user = self.request.user
        chat_id = self.kwargs['chat_pk']  # Extract chat ID from the URL

        chat_queryset = Chat.objects.filter(user=user)
        # Teen-delegated sessions may only read messages of their own profile's chats.
        delegated_profile = delegated_profile_from_auth(self.request.auth)
        if delegated_profile is not None:
            chat_queryset = chat_queryset.filter(profile=delegated_profile)
        elif is_teen_delegated(self.request.auth):
            return Message.objects.none()

        chat = get_object_by_uuid_or_id(chat_queryset, 'chat_id', chat_id)
        queryset = chat.messages
        queryset = queryset.exclude(role='system').order_by('id')

        return queryset

class ChatViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsOwner]
    queryset = Chat.objects.all()

    def get_queryset(self):
        user = self.request.user
        profile_id = self.request.query_params.get('profileId')
        queryset = Chat.objects.filter(user=user).select_related('profile', 'bot', 'bot__ai_model')

        # Teen-delegated sessions are locked to their claimed profile: any
        # client-sent profileId is ignored and the claim is enforced instead.
        delegated_profile = delegated_profile_from_auth(self.request.auth)
        if delegated_profile is not None:
            queryset = queryset.filter(profile=delegated_profile)
        elif is_teen_delegated(self.request.auth):
            queryset = Chat.objects.none()
        elif profile_id:
            queryset = queryset.filter(profile__profile_id=profile_id)

        return queryset.annotate(message_count=Count('messages')).order_by('-modified_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return ChatListSerializer
        return ChatSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        # Scoped to the requesting user and (for teen sessions) the claimed profile.
        chat = get_object_by_uuid_or_id(self.get_queryset(), 'chat_id', lookup_field_value)

        self.check_object_permissions(self.request, chat)
        return chat
