from django.db import models
import uuid


class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    deck = models.ForeignKey('Deck', on_delete=models.CASCADE, related_name='flashcards')
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