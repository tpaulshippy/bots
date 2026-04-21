from django.db import models
import uuid


class Deck(models.Model):
    deck_id = models.UUIDField(default=uuid.uuid4, unique=True)
    profile = models.ForeignKey('Profile', on_delete=models.CASCADE, related_name='decks')
    chat = models.ForeignKey('Chat', on_delete=models.SET_NULL, null=True, blank=True, related_name='decks')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def card_count(self):
        return self.flashcards.count()

    def __str__(self):
        return self.name


class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    deck = models.ForeignKey(Deck, on_delete=models.CASCADE, related_name='flashcards')
    front = models.TextField()
    back = models.TextField()
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["deck", "order"], name="unique_flashcard_order_per_deck")
        ]
        indexes = [
            models.Index(fields=["deck", "order"])
        ]

    def __str__(self):
        return f"{self.deck}: {self.front[:50]}"