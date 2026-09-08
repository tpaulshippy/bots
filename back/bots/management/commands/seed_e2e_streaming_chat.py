# -*- coding: utf-8 -*-
"""Seed an idempotent e2e/demo environment for streaming chat (roadmap doc 06).

Creates:
  - user 'e2e-test-user' / 'testpassword123' (with UserAccount via signal)
  - profile 'E2E Kid'
  - AiModel 'e2e-fake-stream-mitosis' — recognized by AiClientWrapper and wired
    to a deterministic FakeStreamingClient, so the demo path streams tokens
    progressively and creates a "Cell Bio" flashcard deck WITHOUT any real
    Bedrock credentials.
  - bot 'Stream Demo' using that model

Run:  python manage.py seed_e2e_streaming_chat
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from bots.models import AiModel, Bot, Profile
from bots.services.fake_ai import FAKE_MODEL_PREFIX

E2E_USERNAME = 'e2e-test-user'
E2E_PASSWORD = 'testpassword123'
FAKE_MODEL_ID = f'{FAKE_MODEL_PREFIX}-mitosis'
DEMO_BOT_NAME = 'Stream Demo'
DEMO_SYSTEM_PROMPT = (
    'You are a biology tutor for a teenager. Explain topics simply, then offer '
    'to create a flashcard deck for studying. Keep responses under 200 words.'
)


class Command(BaseCommand):
    help = 'Seed idempotent e2e user/profile/bot for the streaming chat demo (no AWS needed)'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=E2E_USERNAME,
            defaults={'email': f'{E2E_USERNAME}@example.com', 'first_name': 'E2E'},
        )
        if created:
            # Signal provisions UserAccount + default profile/bot/chat.
            self.stdout.write(f'Created user {user.username}')
        user.set_password(E2E_PASSWORD)
        user.save()

        ai_model, model_created = AiModel.objects.update_or_create(
            model_id=FAKE_MODEL_ID,
            defaults={
                'name': 'E2E Fake Stream',
                'input_token_cost': 0,
                'output_token_cost': 0,
                'supported_input_modalities': ['text'],
            },
        )
        if model_created:
            self.stdout.write(f'Created fake streaming AiModel {ai_model.model_id}')

        profile = Profile.objects.filter(user=user, deleted_at=None).first()
        if profile is None:
            profile = Profile.objects.create(user=user, name='E2E Kid')
            self.stdout.write(f'Created profile {profile.name}')

        bot, bot_created = Bot.objects.get_or_create(
            user=user,
            name=DEMO_BOT_NAME,
            deleted_at=None,
            defaults={
                'ai_model': ai_model,
                'system_prompt': DEMO_SYSTEM_PROMPT,
                'template_name': 'Blank',
                'enable_web_search': False,
            },
        )
        if not bot_created and bot.ai_model_id != ai_model.id:
            Bot.objects.filter(pk=bot.pk).update(ai_model=ai_model)
            self.stdout.write('Repointed existing demo bot to the fake stream model')

        self.stdout.write(self.style.SUCCESS(
            f'Seeded streaming chat e2e data: user={user.username} '
            f'profile={profile.profile_id} bot={bot.bot_id} model={FAKE_MODEL_ID}'
        ))
