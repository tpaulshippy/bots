import pytest
from django.contrib.auth.models import User
from django.core.management import call_command

from bots.models import Bot


@pytest.mark.django_db
def describe_seed_e2e_onboarding():
    def test_seeds_fresh_onboarding_state(load_fixture):
        call_command('seed_e2e_onboarding')

        user = User.objects.get(username='e2e-test-user')
        assert user.check_password('testpassword123')

        names = set(user.profile_set.filter(deleted_at=None).values_list('name', flat=True))
        assert names == {'Jordan', 'Maya'}

        # Penelope bot provisioned by the signup signal.
        assert Bot.objects.get(user=user).name == 'Penelope'

        # Fresh first-run state: no PIN, no completion flag.
        assert user.user_account.pin_hash is None
        assert user.user_account.onboarding_completed_at is None

    def test_is_idempotent_and_resets_state(load_fixture):
        call_command('seed_e2e_onboarding')
        user = User.objects.get(username='e2e-test-user')
        maya = user.profile_set.get(name='Maya')
        maya.delete()
        jordan = user.profile_set.get(name='Jordan')
        jordan.name = 'Alex'  # a previous e2e run renamed it via the wizard
        jordan.save()
        from bots.services.parent_reauth import hash_pin
        user.user_account.pin_hash = hash_pin('9999')
        user.user_account.save()

        call_command('seed_e2e_onboarding')
        user = User.objects.get(username='e2e-test-user')

        names = set(user.profile_set.filter(deleted_at=None).values_list('name', flat=True))
        assert names == {'Jordan', 'Maya'}
        assert user.user_account.pin_hash is None
        assert user.user_account.onboarding_completed_at is None
