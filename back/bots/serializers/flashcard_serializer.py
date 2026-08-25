from rest_framework import serializers

from bots.models import Chat, Deck, Flashcard, Profile


class FlashcardSerializer(serializers.ModelSerializer):
    deck = serializers.SlugRelatedField(
        queryset=Deck.objects.all(),
        slug_field='deck_id',
        required=False,
        allow_null=True,
        default=None,
    )

    class Meta:
        model = Flashcard
        fields = [
            'id', 'flashcard_id', 'deck', 'front', 'back', 'order',
            'due_at', 'interval_days', 'ease', 'reps', 'lapses',
            'last_reviewed_at', 'created_at', 'updated_at',
        ]


class DeckSerializer(serializers.ModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.IntegerField(read_only=True, source='flashcard_count')
    due_count = serializers.IntegerField(read_only=True)
    last_studied_at = serializers.DateTimeField(read_only=True)
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
        fields = [
            'id', 'deck_id', 'profile', 'chat', 'name', 'description',
            'flashcards', 'card_count', 'due_count', 'last_studied_at',
            'created_at', 'updated_at',
        ]


class DeckListSerializer(serializers.ModelSerializer):
    card_count = serializers.IntegerField(read_only=True, source='flashcard_count')
    due_count = serializers.IntegerField(read_only=True)
    last_studied_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Deck
        fields = [
            'id', 'deck_id', 'name', 'description', 'card_count',
            'due_count', 'last_studied_at', 'created_at', 'updated_at',
        ]