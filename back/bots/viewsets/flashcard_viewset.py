import uuid

from django.db.models import Count, F, Max, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.models import Deck, Flashcard, FlashcardReview, Profile
from bots.permissions import IsOwner
from bots.serializers import DeckListSerializer, DeckSerializer, FlashcardSerializer
from bots.services import srs
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id


class FlashcardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwner]
    serializer_class = FlashcardSerializer
    queryset = Flashcard.objects.all()
    lookup_field = "flashcard_id"
    lookup_url_kwarg = "flashcardId"

    def _owned_decks(self):
        """Decks visible to this request: owned by the requesting user, and
        scoped to the claimed profile for teen-delegated sessions so they
        cannot reach a sibling's decks."""
        if not self.request.user.is_authenticated:
            return Deck.objects.none()
        queryset = Deck.objects.filter(profile__user=self.request.user)
        delegated_profile = delegated_profile_from_auth(self.request.auth)
        if delegated_profile is not None:
            queryset = queryset.filter(profile=delegated_profile)
        elif is_teen_delegated(self.request.auth):
            return Deck.objects.none()
        return queryset

    def get_queryset(self):
        deck_id = self.kwargs['deck_pk']

        # Scope to decks owned by the requesting user so foreign decks 404
        # instead of leaking existence.
        deck = get_object_by_uuid_or_id(self._owned_decks(), 'deck_id', deck_id)

        self.check_object_permissions(self.request, deck)

        return Flashcard.objects.filter(deck=deck).order_by('order', 'created_at')

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_url_kwarg]
        deck_pk = self.kwargs['deck_pk']

        deck = get_object_by_uuid_or_id(self._owned_decks(), 'deck_id', deck_pk)
        flashcard = get_object_by_uuid_or_id(
            Flashcard.objects.filter(deck=deck), 'flashcard_id', lookup_field_value
        )

        self.check_object_permissions(self.request, flashcard)
        return flashcard

    def perform_create(self, serializer):
        deck_id = self.kwargs['deck_pk']

        deck = get_object_by_uuid_or_id(self._owned_decks(), 'deck_id', deck_id)

        self.check_object_permissions(self.request, deck)

        max_order = Flashcard.objects.filter(deck=deck).aggregate(Max('order'))['order__max'] or -1
        serializer.save(deck=deck, order=max_order + 1)

    @action(detail=True, methods=['post'], url_path='review')
    def review(self, request, deck_pk=None, flashcardId=None):
        """Rate a card (again|hard|good|easy) and reschedule it via SM-2."""
        flashcard = self.get_object()

        rating = request.data.get('rating')
        if rating not in srs.RATINGS:
            return Response(
                {'rating': f"Invalid rating. Expected one of: {', '.join(srs.RATINGS)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updates = srs.apply_sm2(flashcard, rating)
        for field, value in updates.items():
            setattr(flashcard, field, value)
        flashcard.save(update_fields=list(updates.keys()) + ['updated_at'])

        FlashcardReview.objects.create(
            flashcard=flashcard,
            profile=flashcard.deck.profile,
            rating=rating,
        )

        return Response(FlashcardSerializer(flashcard).data)


class DeckViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    serializer_class = DeckSerializer
    queryset = Deck.objects.all()

    def get_queryset(self):
        user = self.request.user
        profile_id = self.request.query_params.get('profileId')

        queryset = Deck.objects.filter(profile__user=user)

        # Teen-delegated sessions are locked to their claimed profile: any
        # client-sent profileId is ignored and the claim is enforced instead.
        delegated_profile = delegated_profile_from_auth(self.request.auth)
        if delegated_profile is not None:
            queryset = Deck.objects.filter(profile=delegated_profile)
        elif is_teen_delegated(self.request.auth):
            queryset = Deck.objects.none()
        elif profile_id:
            try:
                profile_uuid = uuid.UUID(profile_id)
                queryset = queryset.filter(profile__profile_id=profile_uuid)
            except ValueError:
                queryset = queryset.none()

        now = timezone.now()
        return queryset.annotate(
            flashcard_count=Count('flashcards'),
            due_count=Count('flashcards', filter=Q(flashcards__due_at__lte=now)),
            last_studied_at=Max('flashcards__last_reviewed_at'),
        ).order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return DeckListSerializer
        return DeckSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        deck = get_object_by_uuid_or_id(self.get_queryset(), 'deck_id', lookup_field_value)

        self.check_object_permissions(self.request, deck)
        return deck

    def perform_create(self, serializer):
        from rest_framework import serializers as drf_serializers
        user = self.request.user
        profile_id = self.request.data.get('profile')
        chat_id = self.request.data.get('chat')

        # Teen-delegated sessions always write decks for their claimed profile
        # (client-sent profile/chat are ignored).
        if is_teen_delegated(self.request.auth):
            delegated_profile = delegated_profile_from_auth(self.request.auth)
            if delegated_profile is None:
                raise drf_serializers.ValidationError("Invalid or unauthorized profile ID")
            serializer.save(profile=delegated_profile, chat=None)
            return

        if profile_id:
            try:
                profile_uuid = uuid.UUID(profile_id)
                profile = Profile.objects.get(profile_id=profile_uuid, user=user)
            except (ValueError, Profile.DoesNotExist):
                raise drf_serializers.ValidationError("Invalid or unauthorized profile ID")
        else:
            profile = Profile.objects.filter(user=user).first()
            if not profile:
                raise drf_serializers.ValidationError("No profile found for user")

        if chat_id:
            try:
                chat_uuid = uuid.UUID(chat_id)
                from bots.models import Chat
                chat = Chat.objects.get(chat_id=chat_uuid, user=user)
            except ValueError:
                raise drf_serializers.ValidationError(f"Invalid UUID format for chat_id: {chat_id}")
            except Chat.DoesNotExist:
                raise drf_serializers.ValidationError(f"Chat with ID {chat_id} not found or unauthorized")
        else:
            chat = None

        serializer.save(profile=profile, chat=chat)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()

    @action(detail=True, methods=['get'], url_path='study_queue')
    def study_queue(self, request, pk=None):
        """Cards to study, ordered by due_at ascending (nulls last).

        Query params:
            mode: 'due' (default) only cards due now, or 'all'
            limit: max cards returned (default 50, capped at 200)
        """
        deck = self.get_object()

        mode = request.query_params.get('mode', 'due')
        if mode not in ('due', 'all'):
            return Response(
                {'mode': "Invalid mode. Expected 'due' or 'all'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = deck.flashcards.all()
        if mode == 'due':
            queryset = queryset.filter(due_at__lte=timezone.now())

        queryset = queryset.order_by(
            F('due_at').asc(nulls_last=True), 'order', 'created_at'
        )

        try:
            limit = int(request.query_params.get('limit', 50))
        except (TypeError, ValueError):
            return Response({'limit': 'Invalid limit'}, status=status.HTTP_400_BAD_REQUEST)
        limit = max(1, min(limit, 200))
        queryset = queryset[:limit]

        serializer = FlashcardSerializer(queryset, many=True)
        return Response(serializer.data)
