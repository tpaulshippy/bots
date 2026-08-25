"""
Seed data for the teen delegated login e2e suite (front/e2e/01-teen-login.e2e.js).

Idempotent: safe to run repeatedly on a dev database or a fresh one.

    python manage.py seed_e2e_teen_login

Creates:
- Parent user  username='e2e-test-user' password='testpassword123'
               (with UserAccount, Penelope bot, welcome chat via signals)
- Teen profile 'Maya' bound to oauth_email 'maya@school.edu'
- Sibling profile 'Leo' (unbound) for parent profile-switching flows
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from bots.models import AiModel, Bot, Profile

PARENT_USERNAME = 'e2e-test-user'
PARENT_PASSWORD = 'testpassword123'
TEEN_EMAIL = 'maya@school.edu'


class Command(BaseCommand):
    help = 'Seed idempotent e2e data for the teen delegated login feature.'

    def handle(self, *args, **options):
        self._ensure_default_ai_model()

        user, created = self._ensure_parent_user()

        maya = self._ensure_profile(user, name='Maya', oauth_email=TEEN_EMAIL)
        leo = self._ensure_profile(user, name='Leo')

        bot = Bot.objects.filter(user=user, deleted_at=None).first()
        if bot is None:
            default_model = AiModel.objects.filter(is_default=True).first()
            if default_model:
                bot = Bot.objects.create(
                    user=user,
                    ai_model=default_model,
                    name='Penelope',
                    template_name='Blank',
                    system_prompt='You are a helpful writing tutor.',
                )
                self.stdout.write('Created Penelope bot')

        self.stdout.write(self.style.SUCCESS(
            'e2e teen login seed ready:\n'
            f"  parent: {user.username} (id={user.id})\n"
            f"  teen profile: {maya.name} (profile_id={maya.profile_id}, "
            f"oauth_email={maya.oauth_email})\n"
            f"  sibling profile: {leo.name} (profile_id={leo.profile_id})\n"
            f"  bot: {bot.name if bot else 'NONE'}"
        ))

    def _ensure_default_ai_model(self):
        """Signals provision a Penelope bot only when a default model exists."""
        model = AiModel.objects.filter(is_default=True).first()
        if model is not None:
            return model
        model = AiModel.objects.get_or_create(
            model_id='us.amazon.nova-micro-v1:0',
            defaults={
                'name': 'Nova Micro',
                'input_token_cost': 0.000000035,
                'output_token_cost': 0.00000014,
                'is_default': True,
                'supported_input_modalities': ['text'],
            },
        )[0]
        self.stdout.write('Created default AiModel')
        return model

    def _ensure_parent_user(self):
        user = User.objects.filter(username=PARENT_USERNAME).first()
        if user is None:
            # Signals create the UserAccount + default profile + Penelope.
            user = User.objects.create_user(
                username=PARENT_USERNAME,
                email='parent@example.com',
                password=PARENT_PASSWORD,
                first_name='Parent',
            )
            created = True
        else:
            # Keep the password correct even if the row already existed.
            user.set_password(PARENT_PASSWORD)
            user.save()
            created = False
        self.stdout.write(
            f"{'Created' if created else 'Reused'} parent user '{user.username}'"
        )
        return user, created

    def _ensure_profile(self, user, name, oauth_email=None):
        profile = Profile.objects.filter(user=user, name=name, deleted_at=None).first()
        if profile is None:
            profile = Profile.objects.create(
                user=user, name=name, oauth_email=oauth_email
            )
            self.stdout.write(f"Created profile '{name}'")
        elif oauth_email is not None and (profile.oauth_email or '').lower() != oauth_email.lower():
            profile.oauth_email = oauth_email
            profile.save()
            self.stdout.write(f"Updated profile '{name}' oauth_email")
        return profile
