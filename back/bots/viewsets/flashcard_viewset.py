from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from django.db.models import Count, Max
from django.db import transaction
import uuid
from bots.models import Deck, Flashcard, Profile
from bots.permissions import IsOwner
from bots.serializers import FlashcardSerializer, DeckSerializer, DeckListSerializer


class FlashcardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    serializer_class = FlashcardSerializer
    queryset = Flashcard.objects.all()
    lookup_field = "flashcard_id"
    lookup_url_kwarg = "flashcardId"

    def get_queryset(self):
        deck_id = self.kwargs['deck_pk']
        
        try:
            deck_uuid = uuid.UUID(deck_id)
            deck = Deck.objects.get(deck_id=deck_uuid)
        except (ValueError, Deck.DoesNotExist):
            try:
                deck = Deck.objects.get(id=deck_id)
            except (ValueError, Deck.DoesNotExist):
                raise NotFound("Deck not found")
        
        self.check_object_permissions(self.request, deck)
        
        return Flashcard.objects.filter(deck=deck).order_by('order')

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            flashcard_uuid = uuid.UUID(lookup_field_value)
            flashcard = Flashcard.objects.get(flashcard_id=flashcard_uuid)
        except (ValueError, Flashcard.DoesNotExist):
            try:
                flashcard = Flashcard.objects.get(id=lookup_field_value)
            except (ValueError, Flashcard.DoesNotExist):
                raise NotFound("Flashcard not found")

        self.check_object_permissions(self.request, flashcard)
        return flashcard

    def perform_create(self, serializer):
        deck_id = self.kwargs['deck_pk']
        try:
            deck_uuid = uuid.UUID(deck_id)
            deck = Deck.objects.select_for_update().get(deck_id=deck_uuid)
        except (ValueError, Deck.DoesNotExist):
            try:
                deck = Deck.objects.select_for_update().get(id=deck_id)
            except (ValueError, Deck.DoesNotExist):
                raise NotFound("Deck not found")
        
        self.check_object_permissions(self.request, deck)
        
        with transaction.atomic():
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

        try:
            deck_uuid = uuid.UUID(lookup_field_value)
            deck = self.get_queryset().get(deck_id=deck_uuid)
        except (ValueError, Deck.DoesNotExist):
            try:
                deck = self.get_queryset().get(id=lookup_field_value)
            except (ValueError, Deck.DoesNotExist):
                raise NotFound("Deck not found")

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
        
        chat = None
        if chat_id:
            try:
                chat_uuid = uuid.UUID(chat_id)
                from bots.models import Chat
                chat = Chat.objects.get(chat_id=chat_uuid, user=user)
            except (ValueError, Chat.DoesNotExist):
                chat = None
        
        serializer.save(profile=profile, chat=chat)

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()