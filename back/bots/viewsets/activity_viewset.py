from datetime import timedelta

from django.db.models import Count, OuterRef, Q, Subquery, Value
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response

from bots.models import Chat, Message, Profile
from bots.permissions import IsParentSession
from bots.serializers import (
    ActivityBotSerializer,
    ActivityChatListSerializer,
    ActivityProfileSerializer,
    ActivitySummarySerializer,
    MessageSerializer,
)
from bots.viewsets.mixins import get_object_by_uuid_or_id


def annotate_activity(queryset):
    """Annotate chats with the fields the parent inbox needs.

    Counts and previews exclude system messages so the numbers match what
    the parent sees in the read-only transcript.
    """
    recent_messages = (
        Message.objects.filter(chat=OuterRef('pk'))
        .exclude(role='system')
        .order_by('-created_at', '-id')
    )
    return queryset.annotate(
        message_count=Count('messages', filter=~Q(messages__role='system')),
        last_message_preview=Subquery(recent_messages.values('text')[:1]),
        last_message_at=Subquery(recent_messages.values('created_at')[:1]),
        # SafetyEvent arrives with roadmap 03; until then no chat has safety events.
        safety_event_count=Value(0),
    )


def apply_activity_filters(queryset, params):
    """Apply the documented activity query params: profileId, botId, since, until, hasSafetyEvent."""
    profile_id = params.get('profileId')
    if profile_id:
        queryset = queryset.filter(profile__profile_id=profile_id)

    bot_id = params.get('botId')
    if bot_id:
        queryset = queryset.filter(bot__bot_id=bot_id)

    since = params.get('since')
    if since:
        queryset = queryset.filter(modified_at__gte=since)

    until = params.get('until')
    if until:
        queryset = queryset.filter(modified_at__lte=until)

    if params.get('hasSafetyEvent', '').lower() == 'true':
        # No SafetyEvent rows can exist before roadmap 03 ships.
        queryset = queryset.filter(pk__in=Chat.objects.none())

    return queryset


class ActivityChatViewSet(viewsets.GenericViewSet):
    """Parent inbox: list recent chats across profiles + read-only transcript.

    Read-only by design: parents review here, they never write into the kid
    thread (roadmap 04 non-goal).
    """
    permission_classes = [IsParentSession]
    serializer_class = ActivityChatListSerializer

    def get_queryset(self):
        return apply_activity_filters(
            annotate_activity(
                Chat.objects.filter(user=self.request.user).select_related('profile', 'bot')
            ),
            self.request.query_params,
        ).order_by('-modified_at')

    def get_object(self):
        lookup_value = self.kwargs[self.lookup_field]
        chat = get_object_by_uuid_or_id(self.get_queryset(), 'chat_id', lookup_value)
        self.check_object_permissions(self.request, chat)
        return chat

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        serializer = ActivityChatListSerializer(
            page if page is not None else queryset, many=True
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        chat = self.get_object()
        messages = chat.messages.exclude(role='system').order_by('id')
        return Response({
            'chat_id': str(chat.chat_id),
            'title': chat.title,
            'profile': ActivityProfileSerializer(chat.profile).data,
            'bot': ActivityBotSerializer(chat.bot).data if chat.bot else None,
            'message_count': messages.count(),
            'messages': MessageSerializer(messages, many=True, context=self.get_serializer_context()).data,
            # SafetyEvent markers land with roadmap 03.
            'safety_events': [],
        })


class ActivitySummaryViewSet(viewsets.ViewSet):
    """Per-profile activity counts for the "This week" chips."""
    permission_classes = [IsParentSession]

    def list(self, request):
        try:
            days = int(request.query_params.get('days', 7))
        except (TypeError, ValueError):
            days = 7
        days = max(1, min(days, 365))
        since = timezone.now() - timedelta(days=days)

        profiles_payload = []
        profiles = Profile.objects.filter(user=request.user, deleted_at=None).order_by('id')
        for profile in profiles:
            chats = Chat.objects.filter(user=request.user, profile=profile, created_at__gte=since)
            message_count = chats.aggregate(
                total=Count('messages', filter=~Q(messages__role='system'))
            )['total'] or 0
            top_bots = [
                {'name': row['bot__name'], 'count': row['count']}
                for row in (
                    chats.exclude(bot=None)
                    .values('bot__name')
                    .annotate(count=Count('pk'))
                    .order_by('-count')[:3]
                )
            ]
            profiles_payload.append({
                'profile_id': str(profile.profile_id),
                'name': profile.name,
                'chat_count': chats.count(),
                'message_count': message_count,
                # SafetyEvent arrives with roadmap 03.
                'safety_event_count': 0,
                'top_bots': top_bots,
            })

        serializer = ActivitySummarySerializer({'profiles': profiles_payload})
        return Response(serializer.data)
