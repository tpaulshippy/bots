from rest_framework import viewsets, status
from rest_framework.exceptions import NotFound
from django.db.models import Count, Max
import uuid
from bots.models import Deck, Flashcard, Profile
from bots.permissions import IsOwner
from bots.serializers import FlashcardSerializer, DeckSerializer, DeckListSerializer


class FlashcardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwner]
    serializer_class = FlashcardSerializer
    queryset = Flashcard.objects.all()

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

    def perform_create(self, serializer):
        deck_id = self.kwargs['deck_pk']
        try:
            deck_uuid = uuid.UUID(deck_id)
            deck = Deck.objects.get(deck_id=deck_uuid)
        except (ValueError, Deck.DoesNotExist):
            try:
                deck = Deck.objects.get(id=deck_id)
            except (ValueError, Deck.DoesNotExist):
                raise NotFound("Deck not found")
        
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
        
        return queryset.annotate(card_count=Count('flashcards')).order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return DeckListSerializer
        return DeckSerializer

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]

        try:
            deck_uuid = uuid.UUID(lookup_field_value)
            deck = Deck.objects.get(deck_id=deck_uuid)
        except (ValueError, Deck.DoesNotExist):
            try:
                deck = Deck.objects.get(id=lookup_field_value)
            except (ValueError, Deck.DoesNotExist):
                raise NotFound("Deck not found")

        self.check_object_permissions(self.request, deck)
        return deck

    def perform_create(self, serializer):
        user = self.request.user
        profile_id = self.request.data.get('profile')
        chat_id = self.request.data.get('chat')
        
        if profile_id:
            try:
                profile_uuid = uuid.UUID(profile_id)
                profile = Profile.objects.get(profile_id=profile_uuid, user=user)
            except (ValueError, Profile.DoesNotExist):
                profile = Profile.objects.filter(user=user).first()
        else:
            profile = Profile.objects.filter(user=user).first()
        
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