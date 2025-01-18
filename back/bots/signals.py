from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserAccount, Chat

@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    if created:
        UserAccount.objects.create(user=instance)
    else:
        instance.user_account.save()

@receiver(post_save, sender=Chat)
def notify_chat(sender, instance, created, **kwargs):
    if created:
        for device in instance.user.devices.all():
            device.notify(instance, True)
