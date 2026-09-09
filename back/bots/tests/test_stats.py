from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Deck, Flashcard, FlashcardReview, Message, Profile
from bots.services.stats import get_profile_stats


def _noon(days_ago):
    """UTC noon n days ago — immune to midnight test-run flakiness."""
    return (timezone.now() - timedelta(days=days_ago)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username='stats-user', email='stats@example.com', password='testpass123'
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username='stats-other', email='stats-other@example.com', password='testpass123'
    )


@pytest.fixture
def test_profile(test_user):
    return Profile.objects.create(user=test_user, name='Maya')


@pytest.fixture
def auth_client(test_user):
    client = APIClient()
    refresh = RefreshToken.for_user(test_user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.fixture
def bot(test_user):
    return Bot.objects.create(user=test_user, name='Penelope')


@pytest.fixture
def chat(test_user, test_profile, bot):
    return Chat.objects.create(user=test_user, profile=test_profile, bot=bot, title='t')


@pytest.fixture
def deck(test_profile):
    return Deck.objects.create(profile=test_profile, name='Cell Bio')


@pytest.fixture
def card(deck):
    return Flashcard.objects.create(deck=deck, front='Q', back='A', order=0)


def _message(chat, role='user', days_ago=0):
    message = Message.objects.create(chat=chat, role=role, text='hello')
    Message.objects.filter(pk=message.pk).update(created_at=_noon(days_ago))
    return message


def _review(card, profile, rating='good', days_ago=0):
    review = FlashcardReview.objects.create(
        flashcard=card, profile=profile, rating=rating
    )
    FlashcardReview.objects.filter(pk=review.pk).update(reviewed_at=_noon(days_ago))
    return review


@pytest.mark.django_db
class TestGetProfileStats:
    def test_empty_profile(self, test_profile):
        stats = get_profile_stats(test_profile)
        assert stats['current_streak'] == 0
        assert stats['longest_streak'] == 0
        assert stats['total_chats'] == 0
        assert stats['total_messages'] == 0
        assert stats['total_reviews'] == 0
        assert stats['chatted_today'] is False
        assert stats['studied_today'] is False
        assert len(stats['week']) == 7
        assert all(day['messages'] == 0 and day['reviews'] == 0 for day in stats['week'])

    def test_mixed_chat_and_review_streak(self, test_profile, chat, card):
        _message(chat, days_ago=2)
        _review(card, test_profile, days_ago=1)
        _message(chat, days_ago=0)

        stats = get_profile_stats(test_profile)
        assert stats['current_streak'] == 3
        assert stats['longest_streak'] == 3
        assert stats['total_messages'] == 2
        assert stats['total_reviews'] == 1
        assert stats['chatted_today'] is True
        assert stats['studied_today'] is False

    def test_gap_breaks_current_but_keeps_longest(self, test_profile, chat, card):
        # 3-day run ending 5 days ago, then a lone review yesterday.
        _message(chat, days_ago=7)
        _message(chat, days_ago=6)
        _review(card, test_profile, days_ago=5)
        _review(card, test_profile, days_ago=1)

        stats = get_profile_stats(test_profile)
        assert stats['current_streak'] == 1
        assert stats['longest_streak'] == 3
        assert stats['chatted_today'] is False
        assert stats['studied_today'] is False

    def test_quiet_today_keeps_yesterday_streak(self, test_profile, chat):
        _message(chat, days_ago=1)

        stats = get_profile_stats(test_profile)
        assert stats['current_streak'] == 1

    def test_system_messages_do_not_count(self, test_profile, chat):
        _message(chat, role='system', days_ago=0)

        stats = get_profile_stats(test_profile)
        assert stats['current_streak'] == 0
        assert stats['total_messages'] == 0

    def test_week_buckets_messages_and_reviews(self, test_profile, chat, card):
        _message(chat, days_ago=0)
        _message(chat, days_ago=0)
        _review(card, test_profile, days_ago=3)

        stats = get_profile_stats(test_profile)
        by_date = {day['date']: day for day in stats['week']}
        today = str(timezone.now().date())
        three_ago = str((timezone.now() - timedelta(days=3)).date())
        assert by_date[today]['messages'] == 2
        assert by_date[today]['reviews'] == 0
        assert by_date[three_ago]['reviews'] == 1
        # 8 days ago falls outside the 7-day window.
        _review(card, test_profile, days_ago=8)
        stats = get_profile_stats(test_profile)
        assert stats['total_reviews'] == 2
        assert sum(day['reviews'] for day in stats['week']) == 1

    def test_review_right_now_counts_today(self, test_profile, card):
        # Regression guard: __date truncation happens in TIME_ZONE while the
        # week buckets are UTC — a review stamped "now" must land in today.
        # (Bites hardest in the evening when UTC has rolled past midnight.)
        FlashcardReview.objects.create(
            flashcard=card, profile=test_profile, rating='good'
        )

        stats = get_profile_stats(test_profile)
        assert stats['week'][-1]['reviews'] == 1
        assert stats['studied_today'] is True


@pytest.mark.django_db
class TestStatsEndpoint:
    def test_stats_shape(self, auth_client, test_profile, chat, card):
        _message(chat, days_ago=0)
        _review(card, test_profile, days_ago=0)

        response = auth_client.get(f'/api/stats.json?profileId={test_profile.profile_id}')

        assert response.status_code == 200
        data = response.json()
        assert data['profile_id'] == str(test_profile.profile_id)
        assert data['current_streak'] == 1
        assert data['total_chats'] == 1
        assert data['total_messages'] == 1
        assert data['total_reviews'] == 1
        assert data['chatted_today'] is True
        assert data['studied_today'] is True
        assert len(data['week']) == 7

    def test_missing_profile_id_returns_400(self, auth_client, test_profile):
        assert auth_client.get('/api/stats.json').status_code == 400

    def test_invalid_profile_id_returns_400(self, auth_client, test_profile):
        assert auth_client.get('/api/stats.json?profileId=bogus').status_code == 400

    def test_other_users_profile_returns_404(self, auth_client, other_user):
        foreign = Profile.objects.create(user=other_user, name='Sam')
        response = auth_client.get(f'/api/stats.json?profileId={foreign.profile_id}')
        assert response.status_code == 404

    def test_requires_authentication(self, test_profile):
        response = APIClient().get(f'/api/stats.json?profileId={test_profile.profile_id}')
        assert response.status_code == 401
