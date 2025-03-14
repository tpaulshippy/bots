from datetime import datetime, time
from django.db import models
from .user_account import UserAccount
from django.utils import timezone
import pytz

class UsageLimitHit(models.Model):
    user_account = models.ForeignKey(UserAccount, 
                                     on_delete=models.CASCADE,
                                     related_name='usage_limit_hits')

    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    subscription_level = models.IntegerField(default=0)
    total_input_tokens = models.IntegerField(default=0)
    total_output_tokens = models.IntegerField(default=0)

    def __str__(self):
        return self.user_account.user.email + ' - ' + str(self.created_at)