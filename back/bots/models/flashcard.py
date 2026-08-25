import uuid

from django.db import models
from django.utils import timezone


class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    deck = models.ForeignKey('Deck', on_delete=models.CASCADE, related_name='flashcards')
    front = models.TextField()
    back = models.TextField()
    order = models.PositiveIntegerField(default=0)
    # Spaced repetition scheduling (SM-2 style). New cards are due immediately.
    due_at = models.DateTimeField(null=True, blank=True, db_index=True, default=timezone.now)
    interval_days = models.FloatField(default=0)
    ease = models.FloatField(default=2.5)
    reps = models.PositiveIntegerField(default=0)
    lapses = models.PositiveIntegerField(default=0)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["deck", "order"])
        ]

    def __str__(self):
        return f"{self.deck}: {self.front[:50]}"