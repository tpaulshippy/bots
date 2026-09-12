from django.db import models


class FlashcardReview(models.Model):
    """One row per rating a learner gives a card during study.

    Enables streaks and parent activity summaries ("studied 20 cards")
    without scanning scheduling fields on the cards themselves.
    """

    RATING_CHOICES = [
        ('again', 'Again'),
        ('hard', 'Hard'),
        ('good', 'Good'),
        ('easy', 'Easy'),
    ]

    flashcard = models.ForeignKey('Flashcard', on_delete=models.CASCADE, related_name='reviews')
    profile = models.ForeignKey('Profile', on_delete=models.CASCADE, related_name='flashcard_reviews')
    rating = models.CharField(max_length=8, choices=RATING_CHOICES)
    reviewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['reviewed_at']
        indexes = [
            models.Index(fields=['profile', 'reviewed_at']),
            models.Index(fields=['flashcard', '-reviewed_at']),
        ]

    def __str__(self):
        return f"{self.flashcard_id}: {self.rating} at {self.reviewed_at}"
