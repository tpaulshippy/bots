from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Device, Message, Profile


@pytest.fixture
def parent(db):
    return User.objects.create_user(username='parent', email='parent@example.com', password='pass')


@pytest.fixture
def other_parent(db):
    return User.objects.create_user(username='other', email='other@example.com', password='pass')


def auth_client_for(user, teen=False):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    if teen:
        refresh['session_type'] = 'teen'
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


def make_chat(user, profile, bot, title, messages, created_at=None):
    chat = Chat.objects.create(user=user, profile=profile, bot=bot, title=title)
    for order, (role, text) in enumerate(messages):
        Message.objects.create(chat=chat, role=role, text=text, order=order)
    if created_at is not None:
        # auto_now_add ignores the value on create; backdate explicitly.
        Chat.objects.filter(pk=chat.pk).update(created_at=created_at, modified_at=created_at)
        Message.objects.filter(chat=chat).update(created_at=created_at)
    return chat


@pytest.fixture
def family(parent):
    maya = Profile.objects.create(user=parent, name='Maya')
    sam = Profile.objects.create(user=parent, name='Sam')
    penelope = Bot.objects.create(user=parent, name='Penelope')
    math_bot = Bot.objects.create(user=parent, name='Math Bot')

    now = timezone.now()
    fractions = make_chat(
        parent, maya, penelope,
        'Can you help with fractions?',
        [
            ('user', 'Can you help with fractions?'),
            ('assistant', 'Of course! What part of fractions?'),
        ],
        created_at=now - timedelta(hours=2),
    )
    essay = make_chat(
        parent, maya, penelope,
        'Essay outline help',
        [
            ('user', 'Help me outline my essay'),
            ('assistant', 'Happy to — what is the topic?'),
            ('system', 'You are chatting with a teen.'),
        ],
        created_at=now - timedelta(days=2),
    )
    primes = make_chat(
        parent, sam, math_bot,
        'What is a prime number?',
        [
            ('user', 'What is a prime number?'),
            ('assistant', 'A prime has exactly two factors.'),
            ('system', 'System prompt should never surface.'),
        ],
        created_at=now - timedelta(days=1),
    )
    return {'maya': maya, 'sam': sam, 'penelope': penelope, 'math_bot': math_bot,
            'fractions': fractions, 'essay': essay, 'primes': primes}


@pytest.mark.django_db
class TestActivityChatList:
    def test_requires_authentication(self):
        assert APIClient().get('/api/activity/chats/').status_code == 401

    def test_list_scoped_to_owner_and_shape(self, parent, other_parent, family):
        other_maya = Profile.objects.create(user=other_parent, name='Other Kid')
        make_chat(other_parent, other_maya, None, 'Not yours', [('user', 'secret')])

        response = auth_client_for(parent).get('/api/activity/chats/')

        assert response.status_code == 200
        results = response.json()['results']
        assert {row['chat_id'] for row in results} == {
            str(family['fractions'].chat_id),
            str(family['essay'].chat_id),
            str(family['primes'].chat_id),
        }
        row = next(r for r in results if r['title'] == 'Can you help with fractions?')
        assert row['profile'] == {'profile_id': str(family['maya'].profile_id), 'name': 'Maya'}
        assert row['bot']['name'] == 'Penelope'
        assert row['message_count'] == 2
        assert row['last_message_preview'] == 'Of course! What part of fractions?'
        assert row['safety_event_count'] == 0

    def test_message_count_excludes_system_role(self, parent, family):
        response = auth_client_for(parent).get('/api/activity/chats/')
        counts = {r['title']: r['message_count'] for r in response.json()['results']}
        assert counts['What is a prime number?'] == 2
        assert counts['Essay outline help'] == 2

    def test_profile_filter(self, parent, family):
        response = auth_client_for(parent).get(
            f"/api/activity/chats/?profileId={family['sam'].profile_id}"
        )
        titles = {r['title'] for r in response.json()['results']}
        assert titles == {'What is a prime number?'}

    def test_bot_filter(self, parent, family):
        response = auth_client_for(parent).get(
            f"/api/activity/chats/?botId={family['math_bot'].bot_id}"
        )
        titles = {r['title'] for r in response.json()['results']}
        assert titles == {'What is a prime number?'}

    def test_since_until_filters(self, parent, family):
        now = timezone.now()
        since = (now - timedelta(days=1, hours=6)).isoformat()
        until = (now - timedelta(hours=12)).isoformat()
        response = auth_client_for(parent).get(
            '/api/activity/chats/', {'since': since, 'until': until}
        )
        titles = {r['title'] for r in response.json()['results']}
        assert titles == {'What is a prime number?'}

    def test_has_safety_event_filter_empty_before_feature_03(self, parent, family):
        """No SafetyEvent rows exist before roadmap 03; the filter matches nothing."""
        response = auth_client_for(parent).get('/api/activity/chats/?hasSafetyEvent=true')
        assert response.status_code == 200
        assert response.json()['results'] == []

    def test_teen_session_rejected(self, parent, family):
        client = auth_client_for(parent, teen=True)
        assert client.get('/api/activity/chats/').status_code == 403
        assert client.get('/api/activity/summary/').status_code == 403


@pytest.mark.django_db
class TestActivityChatDetail:
    def test_detail_returns_full_read_only_transcript(self, parent, family):
        chat_id = family['primes'].chat_id
        response = auth_client_for(parent).get(f'/api/activity/chats/{chat_id}/')

        assert response.status_code == 200
        body = response.json()
        assert body['chat_id'] == str(chat_id)
        assert body['profile']['name'] == 'Sam'
        assert body['bot']['name'] == 'Math Bot'
        roles = [m['role'] for m in body['messages']]
        assert roles == ['user', 'assistant']  # system role excluded
        assert body['messages'][0]['text'] == 'What is a prime number?'
        assert body['safety_events'] == []
        assert body['message_count'] == 2

    def test_other_users_chat_is_404(self, parent, other_parent, family):
        client = auth_client_for(other_parent)
        response = client.get(f"/api/activity/chats/{family['fractions'].chat_id}/")
        assert response.status_code == 404

        list_response = client.get('/api/activity/chats/')
        assert list_response.json()['results'] == []

    def test_teen_cannot_open_transcript(self, parent, family):
        client = auth_client_for(parent, teen=True)
        response = client.get(f"/api/activity/chats/{family['fractions'].chat_id}/")
        assert response.status_code == 403


@pytest.mark.django_db
class TestActivitySummary:
    def test_summary_counts_match_fixtures(self, parent, family):
        response = auth_client_for(parent).get('/api/activity/summary/?days=7')

        assert response.status_code == 200
        profiles = response.json()['profiles']
        by_name = {p['name']: p for p in profiles}

        maya = by_name['Maya']
        assert maya['chat_count'] == 2
        assert maya['message_count'] == 4
        assert maya['top_bots'] == [{'name': 'Penelope', 'count': 2}]
        assert maya['safety_event_count'] == 0

        sam = by_name['Sam']
        assert sam['chat_count'] == 1
        assert sam['message_count'] == 2
        assert sam['top_bots'] == [{'name': 'Math Bot', 'count': 1}]

    def test_summary_respects_days_window(self, parent, family):
        response = auth_client_for(parent).get('/api/activity/summary/?days=1')
        by_name = {p['name']: p for p in response.json()['profiles']}
        # Only the fractions chat (2 hours ago) falls inside a 1-day window.
        assert by_name['Maya']['chat_count'] == 1
        assert by_name['Sam']['chat_count'] == 0

    def test_summary_excludes_deleted_profiles(self, parent, family):
        Profile.objects.create(user=parent, name='Ghost', deleted_at=timezone.now())
        response = auth_client_for(parent).get('/api/activity/summary/')
        names = {p['name'] for p in response.json()['profiles']}
        assert 'Ghost' not in names


@pytest.mark.django_db
class TestDeviceSerializerDigestField:
    def test_notify_digest_only_round_trips(self, parent):
        device = Device.objects.create(user=parent, notification_token='tok-1')
        client = auth_client_for(parent)

        response = client.put(
            f'/api/devices/{device.device_id}/',
            {
                'notification_token': 'tok-1',
                'notify_on_new_chat': True,
                'notify_on_new_message': True,
                'notify_digest_only': True,
            },
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['notify_digest_only'] is True

        device.refresh_from_db()
        assert device.notify_digest_only is True
