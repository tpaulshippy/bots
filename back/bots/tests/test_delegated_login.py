import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone as tz
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import AiModel, Bot, Chat, Deck, Profile
from bots.tokens import SyftRefreshToken

PARENT_EMAIL = 'parent@example.com'
TEEN_EMAIL = 'maya@school.edu'


@pytest.fixture
def parent(db):
    return User.objects.create_user(
        username='parent', email=PARENT_EMAIL, password='pass', first_name='Parent'
    )


@pytest.fixture
def teen_profile(parent):
    """Maya's profile, bound to the teen's OAuth email."""
    return Profile.objects.create(user=parent, name='Maya', oauth_email=TEEN_EMAIL)


@pytest.fixture
def sibling_profile(parent):
    return Profile.objects.create(user=parent, name='Leo')


def parent_client(parent):
    client = APIClient()
    refresh = RefreshToken.for_user(parent)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def teen_client(teen_profile):
    """A client holding a teen-delegated token for Maya's profile."""
    client = APIClient()
    refresh = SyftRefreshToken.for_delegated_profile(teen_profile.user, teen_profile)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def post_chat(client, url, payload):
    """POST a chat while stubbing chat.get_response() (a live LLM call)."""
    with patch.object(Chat, 'get_response', return_value='mocked response'):
        return client.post(url, payload)


@pytest.mark.django_db
class TestDelegatedLogin:
    def test_matching_oauth_email_issues_delegated_tokens(self, parent, teen_profile):
        teen_user = User.objects.create_user(username='maya', email=TEEN_EMAIL, password='pass')

        response = APIClient().get(
            '/api/login?json',
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(teen_user).access_token}',
        )

        assert response.status_code == 200
        data = response.json()
        assert data['is_teen_delegated'] is True
        assert data['active_profile_id'] == str(teen_profile.profile_id)

        # The JWT user_id is the PARENT user: the teen has no account of their own.
        access = RefreshToken(data['refresh'])
        assert access['user_id'] == str(parent.id)
        assert access['is_teen_delegated'] is True
        assert access['active_profile_id'] == str(teen_profile.profile_id)

    def test_case_insensitive_email_match(self, parent, teen_profile):
        teen_user = User.objects.create_user(
            username='mayacaps', email=TEEN_EMAIL.upper(), password='pass'
        )

        response = APIClient().get(
            '/api/login?json',
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(teen_user).access_token}',
        )

        assert response.status_code == 200
        assert response.json()['active_profile_id'] == str(teen_profile.profile_id)

    def test_soft_deleted_profile_does_not_delegate(self, parent):
        """Prefer not to delegate: a soft-deleted profile takes the normal
        parent signup/login path (plain tokens, no claims)."""
        profile = Profile.objects.create(user=parent, name='Gone', oauth_email=TEEN_EMAIL)
        profile.deleted_at = tz.now()
        profile.save()

        stranger = User.objects.create_user(username='stranger', email=TEEN_EMAIL, password='pass')

        response = APIClient().get(
            '/api/login?json',
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(stranger).access_token}',
        )

        assert response.status_code == 200
        data = response.json()
        assert 'is_teen_delegated' not in data
        # Plain parent-style session: refresh token carries no delegated claims.
        assert 'is_teen_delegated' not in RefreshToken(data['refresh'])

    def test_parent_who_is_also_teen_email_logs_in_as_parent(self, parent):
        """The parent bound their own email as a teen email on their own
        profile: they must log in as a parent, not be delegated."""
        Profile.objects.create(user=parent, name='Parent', oauth_email=PARENT_EMAIL)

        response = APIClient().get(
            '/api/login?json',
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(parent).access_token}',
        )

        assert response.status_code == 200
        data = response.json()
        assert 'is_teen_delegated' not in data
        assert 'active_profile_id' not in data

    def test_no_matching_email_returns_plain_tokens(self, db):
        newcomer = User.objects.create_user(username='new', email='nobody@example.com', password='pass')

        response = APIClient().get(
            '/api/login?json',
            HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(newcomer).access_token}',
        )

        assert response.status_code == 200
        data = response.json()
        assert 'access' in data and 'refresh' in data
        assert 'is_teen_delegated' not in data


@pytest.mark.django_db
class TestOauthEmailConstraint:
    def test_same_email_cannot_be_bound_to_two_active_profiles(self, parent):
        Profile.objects.create(user=parent, name='Maya', oauth_email=TEEN_EMAIL)

        with pytest.raises(IntegrityError):
            Profile.objects.create(user=parent, name='Copycat', oauth_email=TEEN_EMAIL)

    def test_unbinding_frees_the_email_for_another_profile(self, parent):
        maya = Profile.objects.create(user=parent, name='Maya', oauth_email=TEEN_EMAIL)
        maya.oauth_email = None
        maya.save()

        leo = Profile.objects.create(user=parent, name='Leo')
        leo.oauth_email = TEEN_EMAIL
        leo.save()  # No IntegrityError: NULLs don't collide, rebinding works

    def test_soft_deleted_profile_does_not_block_rebinding(self, parent):
        old = Profile.objects.create(user=parent, name='Old', oauth_email=TEEN_EMAIL)
        from django.utils import timezone
        old.deleted_at = timezone.now()
        old.save()

        new = Profile.objects.create(user=parent, name='New', oauth_email=TEEN_EMAIL)
        assert new.pk is not None


@pytest.mark.django_db
class TestTeenDeniedParentSurfaces:
    def test_teen_cannot_create_profile(self, teen_profile):
        response = teen_client(teen_profile).post('/api/profiles.json', {'name': 'Hacker'})
        assert response.status_code == 403

    def test_teen_cannot_list_profiles(self, parent, teen_profile):
        Profile.objects.create(user=parent, name='Leo')  # sibling stays hidden
        response = teen_client(teen_profile).get('/api/profiles.json')
        assert response.status_code == 403

    def test_teen_cannot_edit_or_delete_profiles(self, teen_profile):
        response = teen_client(teen_profile).put(
            f'/api/profiles/{teen_profile.profile_id}.json', {'name': 'Renamed'}
        )
        assert response.status_code == 403

        response = teen_client(teen_profile).delete(
            f'/api/profiles/{teen_profile.profile_id}.json'
        )
        assert response.status_code == 403

    def test_teen_can_read_own_redacted_profile(self, teen_profile):
        response = teen_client(teen_profile).get('/api/profiles/self.json')
        assert response.status_code == 200
        data = response.json()
        assert data['profile_id'] == str(teen_profile.profile_id)
        assert data['name'] == 'Maya'
        assert 'oauth_email' not in data  # never leak the invited email to the device

    def test_parent_cannot_use_self_endpoint(self, parent, teen_profile):
        response = parent_client(parent).get('/api/profiles/self.json')
        assert response.status_code == 403

    def test_teen_cannot_create_bot(self, teen_profile):
        ai_model = AiModel.objects.filter(is_default=True).first()
        payload = {'name': 'Evil Bot'}
        if ai_model:
            payload['ai_model'] = ai_model.model_id
        response = teen_client(teen_profile).post('/api/bots.json', payload)
        assert response.status_code == 403

    def test_teen_can_read_bots(self, parent, teen_profile):
        bot = Bot.objects.create(user=parent, name='Penelope')
        response = teen_client(teen_profile).get('/api/bots.json')
        assert response.status_code == 200
        assert any(b['bot_id'] == str(bot.bot_id) for b in response.json()['results'])

    def test_teen_cannot_post_pin(self, teen_profile):
        response = teen_client(teen_profile).post('/api/user', {'pin': 9999})
        assert response.status_code == 403

    def test_teen_get_user_is_redacted_of_pin(self, teen_profile):
        response = teen_client(teen_profile).get('/api/user')
        assert response.status_code == 200
        assert 'pin' not in response.json()

    def test_parent_get_user_still_has_pin(self, parent):
        parent.user_account.pin = 1234
        parent.user_account.save()
        response = parent_client(parent).get('/api/user')
        assert response.status_code == 200
        assert response.json()['pin'] == 1234

    def test_teen_cannot_delete_account(self, parent, teen_profile):
        response = teen_client(teen_profile).delete('/api/user/delete')
        assert response.status_code == 403
        assert User.objects.filter(id=parent.id).exists()


@pytest.mark.django_db
class TestTeenChatProfileLock:
    def test_teen_can_create_chat_with_claimed_profile(self, parent, teen_profile):
        response = post_chat(teen_client(teen_profile), '/api/chats/new', {'message': 'hi'})
        assert response.status_code == 200
        chat = Chat.objects.get(chat_id=response.json()['chat_id'])
        assert chat.profile == teen_profile

    def test_teen_client_sent_profile_is_ignored(self, parent, teen_profile, sibling_profile):
        """Even a malicious client cannot create a chat on a sibling profile."""
        response = post_chat(teen_client(teen_profile), '/api/chats/new', {
            'message': 'hi',
            'profile': str(sibling_profile.profile_id),
        })
        assert response.status_code == 200
        chat = Chat.objects.get(chat_id=response.json()['chat_id'])
        assert chat.profile == teen_profile

    def test_teen_cannot_post_to_chat_of_different_profile(self, parent, teen_profile, sibling_profile):
        sibling_chat = Chat.objects.create(
            user=parent, title='Sibling chat', profile=sibling_profile
        )

        response = teen_client(teen_profile).post(f'/api/chats/{sibling_chat.chat_id}', {'message': 'hi'})
        assert response.status_code == 404

    def test_teen_cannot_post_with_forged_other_profile_uuid(self, parent, teen_profile):
        """Posting with an arbitrary (nonexistent) profile id still lands on
        their own profile because the claim wins."""
        response = post_chat(teen_client(teen_profile), '/api/chats/new', {
            'message': 'hi',
            'profile': str(uuid.uuid4()),
        })
        assert response.status_code == 200
        chat = Chat.objects.get(chat_id=response.json()['chat_id'])
        assert chat.profile == teen_profile


@pytest.mark.django_db
class TestTeenDeckAccess:
    def test_teen_can_create_deck_for_claimed_profile(self, teen_profile):
        response = teen_client(teen_profile).post('/api/decks.json', {
            'name': 'Vocab',
            'profile': str(teen_profile.profile_id),
        })
        assert response.status_code == 201
        deck = Deck.objects.get(deck_id=response.json()['deck_id'])
        assert deck.profile == teen_profile

    def test_teen_deck_list_scoped_to_claimed_profile(self, parent, teen_profile, sibling_profile):
        mine = Deck.objects.create(profile=teen_profile, name='Mine')
        Deck.objects.create(profile=sibling_profile, name='Sibling')

        response = teen_client(teen_profile).get('/api/decks.json')
        assert response.status_code == 200
        names = [d['name'] for d in response.json()['results']]
        assert names == [mine.name]

    def test_teen_cannot_read_sibling_deck(self, parent, teen_profile, sibling_profile):
        sibling_deck = Deck.objects.create(profile=sibling_profile, name='Sibling')

        response = teen_client(teen_profile).get(f'/api/decks/{sibling_deck.deck_id}.json')
        assert response.status_code == 404

    def test_teen_deck_profile_param_is_ignored(self, teen_profile, sibling_profile):
        response = teen_client(teen_profile).post('/api/decks.json', {
            'name': 'Sneaky',
            'profile': str(sibling_profile.profile_id),
        })
        assert response.status_code == 201
        deck = Deck.objects.get(deck_id=response.json()['deck_id'])
        assert deck.profile == teen_profile
@pytest.mark.django_db
class TestWebRedirectForwardsClaims:
    def test_web_redirect_query_contains_both_params(self, parent, teen_profile):
        teen_user = User.objects.create_user(username='webby', email=TEEN_EMAIL, password='pass')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(teen_user).access_token}')
        client.cookies['from-web'] = 'true'

        response = client.get('/api/login')

        assert response.status_code == 302
        location = response['Location']
        assert location.startswith('/app/login?')
        assert f"active_profile_id={teen_profile.profile_id}" in location
        assert "is_teen_delegated=true" in location

    def test_web_redirect_parent_has_empty_delegation_params(self, parent):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(parent).access_token}')
        client.cookies['from-web'] = 'true'

        response = client.get('/api/login')

        assert response.status_code == 302
        assert "is_teen_delegated=false" in response['Location']

    @patch.dict('os.environ', {'APP_DEEP_URL': 'botsforkids://login'})
    def test_jwt_template_receives_claim_context(self, parent, teen_profile):
        teen_user = User.objects.create_user(username='tempy', email=TEEN_EMAIL, password='pass')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(teen_user).access_token}')

        response = client.get('/api/login')

        assert response.status_code == 200
        content = response.content.decode()
        assert f"active_profile_id={teen_profile.profile_id}" in content
        assert "is_teen_delegated=true" in content


@pytest.mark.django_db
class TestParentSessionUnchanged:
    def test_parent_can_switch_profiles_and_manage_everything(self, parent, teen_profile, sibling_profile):
        client = parent_client(parent)

        # The parent fixture also has the signal-provisioned default profile.
        profiles = client.get('/api/profiles.json').json()['results']
        assert {p['name'] for p in profiles} >= {'Maya', 'Leo'}

        response = client.post('/api/profiles.json', {'name': 'New Kid'})
        assert response.status_code == 201

        response = post_chat(client, '/api/chats/new', {
            'message': 'hi',
            'profile': str(sibling_profile.profile_id),
        })
        assert response.status_code == 200

        response = client.post('/api/user', {'pin': 4321})
        assert response.status_code == 200
