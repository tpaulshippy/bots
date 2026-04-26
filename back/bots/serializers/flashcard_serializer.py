from rest_framework import serializers
from bots.models import Deck, Flashcard, Profile, Chat


class FlashcardSerializer(serializers.ModelSerializer):
    deck = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'deck', 'front', 'back', 'order', 'created_at', 'updated_at']


class DeckSerializer(serializers.ModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.IntegerField(read_only=True, source='card_count')
    profile = serializers.PrimaryKeyRelatedField(read_only=True)
    chat = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'profile', 'chat', 'name', 'description', 'flashcards', 'card_count', 'created_at', 'updated_at']


class DeckListSerializer(serializers.ModelSerializer):
    card_count = serializers.IntegerField(read_only=True, source='card_count')

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'name', 'description', 'card_count', 'created_at', 'updated_at']