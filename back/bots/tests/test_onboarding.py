import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Profile


def make_auth_client(user, delegated=False):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    if delegated:
        refresh['active_profile_id'] = 'teen-profile-id'
        refresh['is_teen_delegated'] = True
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.fixture
def load_ai_models(db):
    from django.core.management import call_command
    call_command('loaddata', 'ai_models.json')


@pytest.mark.django_db
class TestOnboardingFlag:
    def test_get_user_reports_not_completed_for_fresh_account(self, load_ai_models):
        user = User.objects.create_user(username='fresh', password='pass')

        response = make_auth_client(user).get('/api/user')

        assert response.status_code == 200
        assert response.json()['onboardingCompleted'] is False

    def test_complete_endpoint_sets_flag_idempotently(self, load_ai_models):
        user = User.objects.create_user(username='completer', password='pass')
        client = make_auth_client(user)

        first = client.post('/api/user/onboarding/complete')
        assert first.status_code == 200
        assert first.json()['onboardingCompleted'] is True

        user.user_account.refresh_from_db()
        timestamp = user.user_account.onboarding_completed_at
        assert timestamp is not None

        second = client.post('/api/user/onboarding/complete')
        assert second.status_code == 200
        user.user_account.refresh_from_db()
        assert user.user_account.onboarding_completed_at == timestamp

    def test_get_user_reflects_completed_flag(self, load_ai_models):
        user = User.objects.create_user(username='flagged', password='pass')
        make_auth_client(user).post('/api/user/onboarding/complete')

        response = make_auth_client(user).get('/api/user')

        assert response.json()['onboardingCompleted'] is True

    def test_heuristic_fallback_when_flag_missing(self, load_ai_models):
        """Old accounts never see the wizard: pin + a profile counts as done."""
        user = User.objects.create_user(username='heuristic', password='pass')
        user.user_account.pin = 1234
        user.user_account.save()
        # Signup signal provisioned one profile.

        response = make_auth_client(user).get('/api/user')

        assert response.json()['onboardingCompleted'] is True

    def test_heuristic_fails_without_profile(self, load_ai_models):
        user = User.objects.create_user(username='noprofile', password='pass')
        user.user_account.pin = 1234
        user.user_account.save()
        Profile.objects.filter(user=user).delete()

        response = make_auth_client(user).get('/api/user')

        assert response.json()['onboardingCompleted'] is False

    def test_complete_requires_authentication(self):
        assert APIClient().post('/api/user/onboarding/complete').status_code == 401

    def test_teen_delegated_session_cannot_complete(self, load_ai_models):
        user = User.objects.create_user(username='parent', password='pass')
        client = make_auth_client(user, delegated=True)

        response = client.post('/api/user/onboarding/complete')

        assert response.status_code == 403
        user.user_account.refresh_from_db()
        assert user.user_account.onboarding_completed_at is None


@pytest.mark.django_db
class TestOnboardingBootstrap:
    def payload(self, **overrides):
        body = {
            'profileName': 'Maya',
            'botName': 'Penelope',
            'templateName': 'Blank',
            'pin': '1234',
        }
        body.update(overrides)
        return body

    def test_renames_default_profile_and_bot(self, load_ai_models):
        user = User.objects.create_user(
            username='bootstrap', password='pass', first_name='Jordan')
        original_bot_id = Bot.objects.get(user=user).bot_id

        response = make_auth_client(user).post(
            '/api/onboarding/bootstrap', self.payload(), format='json')

        assert response.status_code == 200
        assert response.json()['onboardingCompleted'] is True

        # The signal-created "Jordan" profile was renamed, not duplicated.
        profiles = Profile.objects.filter(user=user, deleted_at=None)
        assert profiles.count() == 1
        profile = profiles.get()
        assert profile.name == 'Maya'

        bots = Bot.objects.filter(user=user, deleted_at=None)
        assert bots.count() == 1
        bot = bots.get()
        assert bot.bot_id == original_bot_id
        assert bot.name == 'Penelope'
        assert bot.template_name == 'Blank'

        # Clients can select exactly what the wizard configured.
        assert response.json()['profileId'] == str(profile.profile_id)
        assert response.json()['botId'] == str(bot.bot_id)

        user.user_account.refresh_from_db()
        assert user.user_account.pin == 1234
        assert user.user_account.onboarding_completed_at is not None

    def test_bootstrap_is_retryable_without_duplicates(self, load_ai_models):
        user = User.objects.create_user(username='retry', password='pass')
        client = make_auth_client(user)

        client.post('/api/onboarding/bootstrap', self.payload(), format='json')
        client.post('/api/onboarding/bootstrap', self.payload(profileName='Maya B'), format='json')

        assert Profile.objects.filter(user=user, deleted_at=None).count() == 1
        assert Bot.objects.filter(user=user, deleted_at=None).count() == 1
        user.user_account.refresh_from_db()
        assert user.user_account.pin == 1234

    def test_creates_profile_when_parent_deleted_default(self, load_ai_models):
        user = User.objects.create_user(username='nodefault', password='pass')
        Profile.objects.filter(user=user).delete()

        response = make_auth_client(user).post(
            '/api/onboarding/bootstrap', self.payload(), format='json')

        assert response.status_code == 200
        profiles = Profile.objects.filter(user=user, deleted_at=None)
        assert profiles.count() == 1
        assert profiles.get().name == 'Maya'

    def test_creates_bot_when_none_exists(self, load_ai_models):
        user = User.objects.create_user(username='nobots', password='pass')
        Bot.objects.filter(user=user).delete()

        response = make_auth_client(user).post(
            '/api/onboarding/bootstrap', self.payload(), format='json')

        assert response.status_code == 200
        bot = Bot.objects.get(user=user)
        assert bot.name == 'Penelope'
        assert bot.ai_model.is_default

    def test_accepts_template_prompt_and_appearance(self, load_ai_models):
        user = User.objects.create_user(username='appearance', password='pass')

        response = make_auth_client(user).post(
            '/api/onboarding/bootstrap',
            self.payload(
                templateName='Character',
                systemPrompt='Your name is Dragon.',
                color='#E63946',
                icon='sparkles',
            ),
            format='json')

        assert response.status_code == 200
        bot = Bot.objects.get(user=user)
        assert bot.template_name == 'Character'
        assert bot.system_prompt == 'Your name is Dragon.'
        assert bot.color == '#E63946'
        assert bot.icon == 'sparkles'

    def test_invalid_pin_returns_400(self, load_ai_models):
        user = User.objects.create_user(username='badpin', password='pass')

        response = make_auth_client(user).post(
            '/api/onboarding/bootstrap', self.payload(pin='abcd'), format='json')

        assert response.status_code == 400
        user.user_account.refresh_from_db()
        assert user.user_account.pin is None

    def test_teen_delegated_session_is_403(self, load_ai_models):
        user = User.objects.create_user(username='delegated', password='pass')
        client = make_auth_client(user, delegated=True)

        response = client.post(
            '/api/onboarding/bootstrap', self.payload(), format='json')

        assert response.status_code == 403
        assert Profile.objects.get(user=user).name != 'Maya'
