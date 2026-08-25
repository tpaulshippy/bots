"""Seed idempotent e2e data for the server-side safety demo (roadmap 03).

Creates the shared Detox login ('e2e-test-user' / 'testpassword123') plus:
- a profile for the AsyncStorage injection,
- "Safety Demo Bot": custom advanced-editor prompt with restrict flags ON —
  proves the server regenerates the policy suffix even when the parent wrote
  a custom system prompt (safe path: homework questions answer normally;
  unsafe path: adult-topic messages get the fixed refusal),
- "Open Flags Bot": restrict flags OFF — proves the global floor still
  applies (crisis terms still blocked).

Usage: python manage.py seed_e2e_server_safety
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from bots.models import Bot, Profile

E2E_USERNAME = 'e2e-test-user'
E2E_PASSWORD = 'testpassword123'

SAFETY_DEMO_BOT_NAME = 'Safety Demo Bot'
OPEN_FLAGS_BOT_NAME = 'Open Flags Bot'


class Command(BaseCommand):
    help = 'Seed idempotent e2e data for the server-side safety demos.'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(username=E2E_USERNAME)
        if created or not user.check_password(E2E_PASSWORD):
            user.set_password(E2E_PASSWORD)
            user.save()
        self.stdout.write(f"user: {user.username} ({'created' if created else 'exists'})")

        profile, _ = Profile.objects.get_or_create(
            user=user,
            deleted_at=None,
            defaults={'name': 'E2E Kid'},
        )
        if not profile.name:
            # The post_save signal may have created it with a blank first name.
            profile.name = 'E2E Kid'
            profile.save()
        self.stdout.write(f"profile: {profile.name} ({profile.profile_id})")

        safety_bot, created = Bot.objects.update_or_create(
            user=user,
            name=SAFETY_DEMO_BOT_NAME,
            defaults={
                'system_prompt': (
                    'You are a patient math tutor for a 14-year-old. Use '
                    'Socratic questioning. Never just give the final answer.'
                ),
                'simple_editor': False,
                'template_name': '',
                'response_length': 150,
                'restrict_language': True,
                'restrict_adult_topics': True,
                'enable_web_search': False,
                'deleted_at': None,
            },
        )
        self.stdout.write(f"bot: {safety_bot.name} ({'created' if created else 'updated'})")

        open_bot, created = Bot.objects.update_or_create(
            user=user,
            name=OPEN_FLAGS_BOT_NAME,
            defaults={
                'system_prompt': 'You are a relaxed study buddy. All bot-level restrictions are off.',
                'simple_editor': False,
                'template_name': '',
                'response_length': 200,
                'restrict_language': False,
                'restrict_adult_topics': False,
                'enable_web_search': False,
                'deleted_at': None,
            },
        )
        self.stdout.write(f"bot: {open_bot.name} ({'created' if created else 'updated'})")

        self.stdout.write(self.style.SUCCESS('e2e server-safety seed complete'))
