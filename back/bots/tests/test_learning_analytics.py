from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from bots.models import Bot, Chat, Deck, Flashcard, FlashcardReview, Message, Profile
from bots.services.learning_analytics import (
    MessageFeatures,
    extract_message_features,
    query_jev,
    summarize_profile,
)


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="jev-user", email="jev@example.com", password="testpass123"
    )


@pytest.fixture
def profile(user):
    return Profile.objects.create(user=user, name="Jev")


@pytest.fixture
def bot(user):
    return Bot.objects.create(user=user, name="Penelope")


@pytest.fixture
def chat(user, profile, bot):
    return Chat.objects.create(user=user, profile=profile, bot=bot, title="t")


@pytest.fixture
def deck(profile):
    return Deck.objects.create(profile=profile, name="Deck")


@pytest.fixture
def card(deck):
    return Flashcard.objects.create(deck=deck, front="Q", back="A", order=0)


def _message(chat, text="hello math algebra", days_ago=0):
    m = Message.objects.create(chat=chat, role="user", text=text)
    when = (timezone.now() - timedelta(days=days_ago)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    Message.objects.filter(pk=m.pk).update(created_at=when)
    m.refresh_from_db()
    return m


def _review(card, profile, rating="good", days_ago=0):
    r = FlashcardReview.objects.create(flashcard=card, profile=profile, rating=rating)
    when = (timezone.now() - timedelta(days=days_ago)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    FlashcardReview.objects.filter(pk=r.pk).update(reviewed_at=when)
    r.refresh_from_db()
    return r


class TestExtractor:
    def test_returns_typed_probs_in_range(self):
        texts = [
            "I love algebra equations, got it, easy!",
            "I don't get it, I'm stuck on fractions, help?",
            "",
            "Explain photosynthesis please, can you explain?",
            "x" * 500,
        ]
        for text in texts:
            feat = extract_message_features(text)
            assert isinstance(feat, MessageFeatures)
            assert isinstance(feat.subject, str)
            assert 0.0 <= feat.mastery_p <= 1.0
            assert isinstance(feat.struggling, bool)
            assert isinstance(feat.needs_review, bool)
            assert isinstance(feat.scores, dict)

    def test_subject_keywords(self):
        assert extract_message_features("help with algebra equations").subject == "math"
        assert extract_message_features("photosynthesis experiment").subject == "science"

    def test_struggling_cue_lowers_mastery(self):
        low = extract_message_features("I don't get it, I'm so confused, help")
        high = extract_message_features("Got it, that makes sense, easy!")
        assert low.mastery_p < high.mastery_p
        assert low.struggling is True
        assert low.needs_review is True

    def test_jev_stub_off_by_default(self, monkeypatch):
        monkeypatch.delenv("JEV_ANALYTICS_ENABLED", raising=False)
        assert query_jev(["a", "b"], mode="map") is None


@pytest.mark.django_db
class TestSummarizer:
    def test_churn_high_when_inactive(self, chat, profile, card):
        _message(chat, "I don't get algebra, stuck", days_ago=20)
        _review(card, profile, rating="again", days_ago=20)
        messages = Message.objects.filter(chat__profile=profile, role="user")
        reviews = FlashcardReview.objects.filter(profile=profile)
        out = summarize_profile(messages, reviews)
        assert out["message_count"] == 1
        assert out["review_count"] == 1
        assert out["churn_likelihood"] >= 0.8
        assert "math" in out["subjects"]

    def test_churn_low_when_active(self, chat, profile, card):
        _message(chat, "Got it, algebra makes sense, easy!", days_ago=0)
        _review(card, profile, rating="easy", days_ago=0)
        _review(card, profile, rating="good", days_ago=0)
        _review(card, profile, rating="easy", days_ago=0)
        messages = Message.objects.filter(chat__profile=profile, role="user")
        reviews = FlashcardReview.objects.filter(profile=profile)
        out = summarize_profile(messages, reviews)
        assert out["churn_likelihood"] <= 0.3
        assert out["avg_mastery"] >= 0.5
        assert out["days_inactive"] == 0

    def test_empty_profile_defaults(self):
        out = summarize_profile([], [])
        assert out["subjects"] == {}
        assert out["avg_mastery"] == 0.5
        assert out["churn_likelihood"] >= 0.8
