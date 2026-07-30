import uuid

from django.db.models import Count, Max
from rest_framework import viewsets

from bots.models import Deck, Flashcard, Profile
from bots.permissions import IsOwner
from bots.serializers import DeckListSerializer, DeckSerializer, FlashcardSerializer
from bots.viewsets.mixins import get_object_by_uuid_or_id


class FlashcardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    serializer_class = FlashcardSerializer
    queryset = Flashcard.objects.all()
    lookup_field = "flashcard_id"
    lookup_url_kwarg = "flashcardId"

    def get_queryset(self):
        deck_id = self.kwargs['deck_pk']

        deck = get_object_by_uuid_or_id(Deck.objects.all(), 'deck_id', deck_id)

        self.check_object_permissions(self.request, deck)

        return Flashcard.objects.filter(deck=deck).order_by('order', 'created_at')

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_url_kwarg]
        deck_pk = self.kwargs['deck_pk']

        deck = get_object_by_uuid_or_id(Deck.objects.all(), 'deck_id', deck_pk)
        flashcard = get_object_by_uuid_or_id(
            Flashcard.objects.filter(deck=deck), 'flashcard_id', lookup_field_value
        )

        self.check_object_permissions(self.request, flashcard)
        return flashcard

    def perform_create(self, serializer):
        deck_id = self.kwargs['deck_pk']

        deck = get_object_by_uuid_or_id(Deck.objects.all(), 'deck_id', deck_id)

        self.check_object_permissions(self.request, deck)

        max_order = Flashcard.objects.filter(deck=deck).aggregate(Max('order'))['order__max'] or -1
        serializer.save(deck=deck, order=max_order + 1)


class DeckViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    serializer_class = DeckSerializer
    queryset = Deck.objects.all()

    def get_queryset(self):
        user = self.request.user
        profile_id = self.request.query_params.get('profileId')

        queryset = Deck.objects.filter(profile__user=user)

        if profile_id:
            try:
                profile_uuid = uuid.UUID(profile_id)
                queryset = queryset.filter(profile__profile_id=profile_uuid)
            except ValueError:
                queryset = queryset.none()

        return queryset.annotate(flashcard_count=Count('flashcards')).order_by('-created_at')

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
