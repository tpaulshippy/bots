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