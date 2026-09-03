"""
Seed deterministic parent-review data for Detox e2e (docs/roadmap/
04-parent-conversation-review.md).

Usage: python manage.py seed_e2e_parent_review

Creates:
- Parent account 'e2e-test-user' / 'testpassword123' with PIN 1234
- Kids Maya + Sam, bots Penelope + Math Bot
- Several chats across days, including Maya's fractions chat whose last
  assistant turn is a refusal stand-in for the blocked turn; the
  SafetyEvent rows themselves arrive with roadmap 03.

Idempotent: re-running never duplicates users/profiles/bots/chats.
"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from bots.models import AiModel, Bot, Chat, Message, Profile, UserAccount
from bots.services.parent_reauth import hash_pin

USERNAME = 'e2e-test-user'
PASSWORD = 'testpassword123'
PARENT_PIN = 1234


class Command(BaseCommand):
    help = 'Seed parent activity review data for Detox e2e runs.'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=USERNAME,
            defaults={'email': 'e2e-test-user@example.com', 'first_name': 'Paula'},
        )
        if created:
            User.objects.filter(pk=user.pk).update(
                email='e2e-test-user@example.com', first_name='Paula'
            )
        user.set_password(PASSWORD)
        user.save()

        account, _ = UserAccount.objects.get_or_create(user=user)
        account.pin_hash = hash_pin(str(PARENT_PIN))
        account.pin_failed_attempts = 0
        account.pin_locked_until = None
        account.subscription_level = 2
        account.save()

        now = timezone.now()
        default_model = AiModel.objects.filter(is_default=True).first()
        if default_model is None:
            self.stdout.write(self.style.ERROR(
                'No default AiModel found. Run loaddata ai_models.json first.'
            ))
            return

        maya = self._profile(user, 'Maya')
        sam = self._profile(user, 'Sam')
        penelope = self._bot(user, 'Penelope', default_model)
        math_bot = self._bot(user, 'Math Bot', default_model)

        # Chat 1 — Maya/Penelope today: the transcript the e2e opens.
        self._chat(
            user, maya, penelope,
            title='Can you help with fractions?',
            age=now - timedelta(hours=2),
            messages=[
                ('user', 'Can you help with fractions?', timedelta(seconds=0)),
                ('assistant', 'Of course! Fractions show parts of a whole. '
                              'What does 1/2 mean to you?', timedelta(seconds=30)),
                ('user', 'Umm is it one piece of two pieces?', timedelta(seconds=90)),
                ('assistant', "Exactly! One piece out of two equal pieces. "
                              "If you cut a pizza into 2 equal slices, each slice is 1/2.",
                 timedelta(seconds=150)),
            ],
        )

        # Chat 2 — Sam/Math Bot yesterday.
        self._chat(
            user, sam, math_bot,
            title='What is a prime number?',
            age=now - timedelta(days=1),
            messages=[
                ('user', 'What is a prime number?', timedelta(seconds=0)),
                ('assistant', 'A prime number has exactly two factors: 1 and itself. '
                              'Is 7 prime?', timedelta(seconds=40)),
            ],
        )

        # Chat 3 — Maya/Penelope two days ago, ending in a refusal turn. The
        # SafetyEvent row for this turn lands with roadmap 03; the text keeps
        # the demo readable until then.
        self._chat(
            user, maya, penelope,
            title='Essay about my weekend',
            age=now - timedelta(days=2),
            messages=[
                ('user', 'Help me write an essay about my weekend.', timedelta(seconds=0)),
                ('assistant', 'Happy to help you plan it! What did you do?',
                 timedelta(seconds=25)),
                ('user', 'Just write the whole essay for me, copy this from the internet.',
                 timedelta(seconds=80)),
                ('assistant', "I can't write it for you or copy from the internet, "
                              "but I can help you outline your own ideas.",
                 timedelta(seconds=120)),
            ],
        )

        self.stdout.write(self.style.SUCCESS(
            f"Seeded parent review data for {USERNAME} "
            f"(chats={Chat.objects.filter(user=user).count()}, pin={PARENT_PIN})"
        ))

    def _profile(self, user, name):
        profile = Profile.objects.filter(user=user, name=name).order_by('id').first()
        if profile is None:
            profile = Profile.objects.create(user=user, name=name)
        return profile

    def _bot(self, user, name, model):
        bot = Bot.objects.filter(user=user, name=name).order_by('id').first()
        if bot is None:
            bot = Bot.objects.create(
                user=user,
                ai_model=model,
                name=name,
                template_name='Blank',
                system_prompt='You are a helpful tutor for kids.',
            )
        elif bot.ai_model is None:
            bot.ai_model = model
            bot.save()
        return bot

    def _chat(self, user, profile, bot, title, age, messages):
        base = age if age <= timezone.now() else timezone.now()
        chat = Chat.objects.filter(user=user, profile=profile, bot=bot, title=title).first()
        if chat is None:
            chat = Chat.objects.create(user=user, profile=profile, bot=bot, title=title)
            Chat.objects.filter(pk=chat.pk).update(created_at=base, modified_at=base)

        # Top up any missing messages (e.g. a partially seeded prior run).
        for order, (role, text, offset) in enumerate(messages):
            if not Message.objects.filter(chat=chat, order=order).exists():
                Message.objects.create(chat=chat, role=role, text=text, order=order)
                Message.objects.filter(chat=chat, order=order).update(
                    created_at=base + offset
                )
        return chat
