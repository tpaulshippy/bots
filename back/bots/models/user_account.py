from django.contrib.auth.models import User
from django.db import models

class UserAccount(models.Model):
    user = models.OneToOneField(User, 
                                on_delete=models.CASCADE,
                                related_name='user_account')
    pin = models.IntegerField(null=True)
    
