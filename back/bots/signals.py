from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import AiModel, Bot, Chat, Message, Profile, UserAccount

PENELOPE_GREETING = "Hello! I'm Penelope, your writing assistant. How can I help you with writing today?"


@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    if created:
        UserAccount.objects.create(user=instance)
        provision_default_content(instance)
    else:
        instance.user_account.save()


def provision_default_content(user):
    # Idempotent: re-running never duplicates rows
    profile, _ = Profile.objects.get_or_create(
        user=user,
        deleted_at=None,
        defaults={'name': user.first_name}
    )

    bot = Bot.objects.filter(user=user, deleted_at=None).first()
    if bot is None:
        default_model = AiModel.objects.filter(is_default=True).first()
        if default_model is None:
            return
        bot = Bot.objects.create(
            user=user,
            ai_model=default_model,
            name="Penelope",
            template_name="Blank",
            system_prompt=""
        )

    if not Chat.objects.filter(user=user).exists():
        chat = Chat.objects.create(
            user=user,
            profile=profile,
            bot=bot,
            title="Can you help with writing?"
        )
        Message.objects.create(chat=chat, role="assistant", text=PENELOPE_GREETING, order=0)

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
