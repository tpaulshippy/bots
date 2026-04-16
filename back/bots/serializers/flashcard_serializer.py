from rest_framework import serializers
from bots.models import Deck, Flashcard


class FlashcardSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'deck', 'front', 'back', 'order', 'created_at', 'updated_at']


class DeckSerializer(serializers.HyperlinkedModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.SerializerMethodField()

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'profile', 'chat', 'name', 'description', 'flashcards', 'card_count', 'created_at', 'updated_at']

    def get_card_count(self, obj):
        return obj.flashcards.count()


class DeckListSerializer(serializers.HyperlinkedModelSerializer):
    card_count = serializers.SerializerMethodField()

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'name', 'description', 'card_count', 'created_at', 'updated_at']

    def get_card_count(self, obj):
        return obj.flashcards.count()