from django.conf import settings
from django.db import models
from .profile import Profile
from .user_account import UserAccount


class TeenEmailMapping(models.Model):
    teen_profile = models.OneToOneField(
        Profile,
        on_delete=models.CASCADE,
        related_name='teen_email_mapping'
    )
    parent_account = models.ForeignKey(
        UserAccount,
        on_delete=models.CASCADE,
        related_name='teen_mappings'
    )
    oauth_email = models.EmailField(max_length=254)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('oauth_email', 'parent_account')

    def __str__(self):
        return f"{self.oauth_email} -> {self.teen_profile.name}"