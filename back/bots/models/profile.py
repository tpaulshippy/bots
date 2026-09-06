import uuid

from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True
    )
    profile_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    oauth_email = models.EmailField(max_length=254, null=True, blank=True)

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['oauth_email'], name='profile_oauth_email_idx'),
        ]
        # One active profile per delegated sign-in email; soft-deleted profiles
        # do not hold the email.
        constraints = [
            models.UniqueConstraint(
                fields=["oauth_email"],
                condition=models.Q(oauth_email__isnull=False) & models.Q(deleted_at__isnull=True),
                name="unique_active_profile_oauth_email",
            )
        ]

    def __str__(self):
        return self.user.email + ' - ' + self.name
