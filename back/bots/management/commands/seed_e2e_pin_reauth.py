"""Seed an idempotent parent account for the PIN/reauth Detox e2e suite.

Creates (or resets) the parent user used by front/e2e/02-pin-reauth.e2e.js:

    username : e2e-test-user
    password : testpassword123
    PIN      : 1234

The run is safe to repeat: it loads AI models, provisions the default
profile/bot/chat via the normal signup signals, sets the hashed PIN, and
clears any lockout state left over from previous runs.
"""
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import BaseCommand

E2E_USERNAME = 'e2e-test-user'
E2E_PASSWORD = 'testpassword123'
E2E_PIN = '1234'


class Command(BaseCommand):
    help = 'Seed the e2e parent user with a hashed PIN (roadmap doc 02).'

    def handle(self, *args, **options):
        call_command('loaddata', 'ai_models.json', verbosity=0)

        user, created = User.objects.get_or_create(
            username=E2E_USERNAME,
            defaults={'email': f'{E2E_USERNAME}@example.com'},
        )
        user.set_password(E2E_PASSWORD)
        user.save()

        # post_save signal provisions UserAccount + default profile/bot/chat.
        # On very old rows the account may predate that signal; make sure it exists.
        account = getattr(user, 'user_account', None)
        if account is None:
            from bots.models import UserAccount

            account = UserAccount.objects.create(user=user)

        account.pin_hash = make_password(E2E_PIN)
        account.pin_failed_attempts = 0
        account.pin_locked_until = None
        account.save(update_fields=['pin_hash', 'pin_failed_attempts', 'pin_locked_until'])

        profile_count = user.profile_set.filter(deleted_at=None).count()
        bot_count = user.bot_set.filter(deleted_at=None).count()

        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created else 'Reset'} e2e user '{E2E_USERNAME}' "
            f"(pin set to '{E2E_PIN}', {profile_count} active profile(s), "
            f"{bot_count} active bot(s))"
        ))
