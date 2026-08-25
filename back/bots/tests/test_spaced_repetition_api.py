from datetime import datetime, timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Deck, Flashcard, FlashcardReview, Profile


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username='srs-user',
        email='srs@example.com',
        password='testpass123',
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username='other-srs-user',
        email='other-srs@example.com',
        password='testpass123',
    )


@pytest.fixture
def test_profile(test_user):
    return Profile.objects.create(user=test_user, name='SRS Profile')


@pytest.fixture
def auth_client(api_client, test_user):
    refresh = RefreshToken.for_user(test_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def deck(test_profile, db):
    return Deck.objects.create(profile=test_profile, name='Cell Bio')


def make_card(deck, order=0, **scheduling):
    return Flashcard.objects.create(
        deck=deck,
        front=f'Front {order}',
        back=f'Back {order}',
        order=order,
        **scheduling,
    )


@pytest.mark.django_db
class TestReviewEndpoint:
    def test_review_good_updates_scheduling(self, auth_client, deck):
        card = make_card(deck)
        before = timezone.now()

        response = auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'good'},
        )

        assert response.status_code == 200
        data = response.json()
        due_at = datetime.fromisoformat(data['due_at'])
        assert data['reps'] == 1
        assert data['interval_days'] == 1
        assert due_at > before

        card.refresh_from_db()
        assert card.reps == 1
        assert card.interval_days == 1
        assert card.last_reviewed_at is not None
        assert card.due_at is not None

    def test_review_again_increments_lapses_and_resets_reps(self, auth_client, deck):
        card = make_card(deck, reps=3, interval_days=10)

        response = auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'again'},
        )

        assert response.status_code == 200
        data = response.json()
        assert data['lapses'] == 1
        assert data['reps'] == 0
        # Due again within hours (same-day relearn).
        assert datetime.fromisoformat(data['due_at']) < timezone.now() + timedelta(days=1)
    @pytest.mark.parametrize('rating', ['again', 'hard', 'good', 'easy'])
    def test_review_accepts_all_ratings(self, auth_client, deck, rating):
        card = make_card(deck)
        response = auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': rating},
        )
        assert response.status_code == 200
        assert response.json()['last_reviewed_at'] is not None

    def test_review_invalid_rating_returns_400(self, auth_client, deck):
        card = make_card(deck)
        response = auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'ok'},
        )
        assert response.status_code == 400
        card.refresh_from_db()
        assert card.last_reviewed_at is None

    def test_review_missing_rating_returns_400(self, auth_client, deck):
        card = make_card(deck)
        response = auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {},
        )
        assert response.status_code == 400

    def test_review_other_users_deck_returns_404(self, api_client, other_user, deck):
        refresh = RefreshToken.for_user(other_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        card = make_card(deck)

        response = api_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'good'},
        )
        assert response.status_code == 404
        card.refresh_from_db()
        assert card.last_reviewed_at is None

    def test_review_requires_authentication(self, api_client, deck):
        card = make_card(deck)
        response = api_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'good'},
        )
        assert response.status_code == 401

    def test_review_creates_review_log(self, auth_client, test_profile, deck):
        card = make_card(deck)
        auth_client.post(
            f'/api/decks/{deck.deck_id}/flashcards/{card.flashcard_id}/review/',
            {'rating': 'easy'},
        )
        review = FlashcardReview.objects.get(flashcard=card)
        assert review.rating == 'easy'
        assert review.profile == test_profile
        assert review.reviewed_at is not None


@pytest.mark.django_db
class TestStudyQueue:
    def test_new_cards_appear_in_due_queue(self, auth_client, deck):
        # Default due_at=now makes fresh cards immediately studyable.
        card = make_card(deck)
        response = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/')
        assert response.status_code == 200
        results = response.json()
        assert [c['flashcard_id'] for c in results] == [str(card.flashcard_id)]

    def test_due_mode_excludes_future_cards(self, auth_client, deck):
        overdue = make_card(deck, order=0, due_at=timezone.now() - timedelta(days=2))
        future = make_card(deck, order=1, due_at=timezone.now() + timedelta(days=3))

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/').json()

        ids = [c['flashcard_id'] for c in results]
        assert str(overdue.flashcard_id) in ids
        assert str(future.flashcard_id) not in ids

    def test_all_mode_includes_future_cards(self, auth_client, deck):
        overdue = make_card(deck, order=0, due_at=timezone.now() - timedelta(days=2))
        future = make_card(deck, order=1, due_at=timezone.now() + timedelta(days=3))

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/?mode=all').json()

        ids = [c['flashcard_id'] for c in results]
        assert set(ids) == {str(overdue.flashcard_id), str(future.flashcard_id)}

    def test_queue_ordered_by_due_at_ascending(self, auth_client, deck):
        later = make_card(deck, order=0, due_at=timezone.now() + timedelta(hours=2))
        sooner = make_card(deck, order=1, due_at=timezone.now() - timedelta(hours=2))

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/?mode=all').json()

        assert [c['flashcard_id'] for c in results] == [
            str(sooner.flashcard_id),
            str(later.flashcard_id),
        ]

    def test_null_due_at_sorts_last_in_all_mode(self, auth_client, deck):
        scheduled = make_card(deck, order=0, due_at=timezone.now() - timedelta(days=1))
        unscheduled = make_card(deck, order=1, due_at=None)

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/?mode=all').json()

        assert [c['flashcard_id'] for c in results] == [
            str(scheduled.flashcard_id),
            str(unscheduled.flashcard_id),
        ]
        # Null-due cards are not "due", so they stay out of due mode.
        due_results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/').json()
        assert [c['flashcard_id'] for c in due_results] == [str(scheduled.flashcard_id)]

    def test_limit_param(self, auth_client, deck):
        for i in range(5):
            make_card(deck, order=i, due_at=timezone.now() - timedelta(days=1))

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/?limit=3').json()
        assert len(results) == 3

    def test_invalid_mode_returns_400(self, auth_client, deck):
        response = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/?mode=bogus')
        assert response.status_code == 400

    def test_queue_due_filter_respects_timezone(self, auth_client, deck):
        """due_at values are timezone-aware (stored UTC); the due filter must
        compare correctly no matter which zone was used to construct them.
        Without freeze_time we pin cards far in the past/future instead."""
        from datetime import datetime

        try:
            from zoneinfo import ZoneInfo
            tz = ZoneInfo('America/New_York')
        except ImportError:  # pragma: no cover
            import pytz
            tz = pytz.timezone('America/New_York')

        long_overdue = make_card(
            deck, order=0,
            due_at=datetime(2020, 1, 1, 12, 0, tzinfo=tz),  # 17:00 UTC
        )
        far_future = make_card(
            deck, order=1,
            due_at=datetime(2099, 6, 15, 9, 0, tzinfo=tz),
        )

        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/').json()
        ids = [c['flashcard_id'] for c in results]
        assert ids == [str(long_overdue.flashcard_id)]
        assert str(far_future.flashcard_id) not in ids

    def test_study_queue_other_users_deck_returns_404(self, api_client, other_user, deck):
        refresh = RefreshToken.for_user(other_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        response = api_client.get(f'/api/decks/{deck.deck_id}/study_queue/')
        assert response.status_code == 404

    def test_study_queue_includes_scheduling_fields(self, auth_client, deck):
        make_card(deck, ease=2.1, reps=4, lapses=1, interval_days=12.5)
        results = auth_client.get(f'/api/decks/{deck.deck_id}/study_queue/').json()
        card = results[0]
        for field in ('due_at', 'interval_days', 'ease', 'reps', 'lapses', 'last_reviewed_at'):
            assert field in card
        assert card['ease'] == 2.1
        assert card['reps'] == 4


@pytest.mark.django_db
class TestDeckAnnotations:
    def test_deck_list_includes_due_count_and_last_studied(self, auth_client, test_profile, deck):
        studied = make_card(
            deck, order=0,
            due_at=timezone.now() + timedelta(days=2),
            last_reviewed_at=timezone.now() - timedelta(hours=2),
        )
        make_card(deck, order=1, due_at=timezone.now() - timedelta(hours=1))

        response = auth_client.get(f'/api/decks.json?profileId={test_profile.profile_id}')
        assert response.status_code == 200
        row = next(d for d in response.json()['results'] if d['deck_id'] == str(deck.deck_id))

        assert row['due_count'] == 1
        last_studied = datetime.fromisoformat(row['last_studied_at'])
        assert abs((timezone.now() - last_studied).total_seconds()) < 3 * 3600

    def test_deck_detail_includes_due_count(self, auth_client, deck):
        make_card(deck, order=0, due_at=timezone.now() - timedelta(hours=1))
        make_card(deck, order=1, due_at=timezone.now() + timedelta(days=1))

        response = auth_client.get(f'/api/decks/{deck.deck_id}/')
        assert response.status_code == 200
        assert response.json()['due_count'] == 1

    def test_unstudied_deck_has_zero_due_count_and_no_last_studied(self, auth_client, deck):
        # Freshly-created cards are immediately due (default due_at=now).
        make_card(deck)
        response = auth_client.get(f'/api/decks/{deck.deck_id}/')
        data = response.json()
        assert data['due_count'] == 1
        assert data['last_studied_at'] is None
