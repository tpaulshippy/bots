from rest_framework import serializers
from bots.models import Deck, Flashcard, Profile, Chat


class FlashcardSerializer(serializers.HyperlinkedModelSerializer):
    deck = serializers.SlugRelatedField(
        queryset=Deck.objects.all(),
        slug_field='deck_id',
        required=False,
        allow_null=True,
        default=None,
    )

    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'deck', 'front', 'back', 'order', 'created_at', 'updated_at']


class DeckSerializer(serializers.HyperlinkedModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.IntegerField(read_only=True, source='flashcard_count')
    profile = serializers.SlugRelatedField(
        queryset=Profile.objects.all(),
        slug_field='profile_id',
    )
    chat = serializers.SlugRelatedField(
        queryset=Chat.objects.all(),
        slug_field='chat_id',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'profile', 'chat', 'name', 'description', 'flashcards', 'card_count', 'created_at', 'updated_at']


class DeckListSerializer(serializers.HyperlinkedModelSerializer):
    card_count = serializers.IntegerField(read_only=True, source='flashcard_count')
    profile = serializers.SlugRelatedField(
        queryset=Profile.objects.all(),
        slug_field='profile_id',
    )
    chat = serializers.SlugRelatedField(
        queryset=Chat.objects.all(),
        slug_field='chat_id',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'profile', 'chat', 'name', 'description', 'card_count', 'created_at', 'updated_at']