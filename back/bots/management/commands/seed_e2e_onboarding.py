"""Seed an account in fresh-onboarding state for Detox e2e runs (feature 05).

Creates 'e2e-test-user' / 'testpassword123' with:
- the signup-signal default profile ('Jordan') and Penelope bot, so wizard
  step 2 has a name to pre-fill and step 3 a bot to rename,
- no PIN and no onboarding flag, so the app gates to /onboarding,
- a second profile ('Maya') so the profile switcher has something to switch to.

Idempotent: safe to re-run before every test run; it also resets pin/flag so
the account always presents the first-run experience.
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

USERNAME = 'e2e-test-user'
PASSWORD = 'testpassword123'
FIRST_NAME = 'Jordan'
SECOND_PROFILE_NAME = 'Maya'


class Command(BaseCommand):
    help = 'Seed e2e-test-user with a fresh (not-yet-onboarded) account state.'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=USERNAME,
            defaults={'first_name': FIRST_NAME},
        )
        user.first_name = FIRST_NAME
        user.set_password(PASSWORD)
        user.is_active = True
        user.save()

        # user.post_save signal provisions the default profile + Penelope bot.
        profiles = list(user.profile_set.filter(deleted_at=None).order_by('id'))
        if len(profiles) < 1:
            from bots.models import Profile
            Profile.objects.create(user=user, name=FIRST_NAME)
            profiles = list(user.profile_set.filter(deleted_at=None).order_by('id'))

        if len(profiles) < 2:
            from bots.models import Profile
            Profile.objects.create(user=user, name=SECOND_PROFILE_NAME)
            profiles = list(user.profile_set.filter(deleted_at=None).order_by('id'))

        self.stdout.write(f'Profiles: {[p.name for p in profiles]}')

        # Fresh onboarding state on every run.
        account = user.user_account
        account.pin = None
        account.onboarding_completed_at = None
        account.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(
            f"{action} {USERNAME} with fresh onboarding state "
            f"(no PIN, no flag, {len(profiles)} profiles)."))
