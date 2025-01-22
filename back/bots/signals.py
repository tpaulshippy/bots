from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserAccount, Chat, Message

@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    if created:
        UserAccount.objects.create(user=instance)
    else:
        instance.user_account.save()

@receiver(post_save, sender=Chat)
def notify_chat(sender, instance, created, **kwargs):
    if created and instance.user is not None:
        devices = instance.user.devices.all()
        for device in devices:
            device.notify_chat(instance)

@receiver(post_save, sender=Message)
def notify_message(sender, instance, created, **kwargs):
    if created and instance.chat is not None and instance.chat.user is not None:
        devices = instance.chat.user.devices.all()
        for device in devices:
            device.notify_message(instance)
