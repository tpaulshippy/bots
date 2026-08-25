from datetime import timedelta

import pytest
from django.utils import timezone as dj_timezone

from bots.services.srs import (
    DEFAULT_EASE,
    EASY_BONUS,
    FIRST_INTERVAL_DAYS,
    LAPSE_INTERVAL_DAYS,
    MIN_EASE,
    SECOND_INTERVAL_DAYS,
    apply_sm2,
)


class FakeCard:
    """Minimal stand-in for Flashcard; apply_sm2 only reads attributes."""

    def __init__(self, interval_days=0, ease=DEFAULT_EASE, reps=0, lapses=0):
        self.interval_days = interval_days
        self.ease = ease
        self.reps = reps
        self.lapses = lapses


NOW = dj_timezone.now().replace(microsecond=0)


def expected_due(interval_days, now=NOW):
    return now + timedelta(days=interval_days)


class TestApplySm2NewCard:
    """Table of ratings applied to a brand-new card (reps=0)."""

    def test_new_card_good(self):
        fields = apply_sm2(FakeCard(), 'good', NOW)
        assert fields['interval_days'] == FIRST_INTERVAL_DAYS
        assert fields['reps'] == 1
        assert fields['lapses'] == 0
        assert fields['ease'] == DEFAULT_EASE
        assert fields['due_at'] == expected_due(FIRST_INTERVAL_DAYS)
        assert fields['last_reviewed_at'] == NOW

    def test_new_card_easy_is_longer_than_good(self):
        good = apply_sm2(FakeCard(), 'good', NOW)
        easy = apply_sm2(FakeCard(), 'easy', NOW)
        assert easy['interval_days'] == FIRST_INTERVAL_DAYS * EASY_BONUS
        assert easy['interval_days'] > good['interval_days']
        assert easy['ease'] == DEFAULT_EASE + 0.15

    def test_new_card_hard_gets_minimum_one_day(self):
        fields = apply_sm2(FakeCard(), 'hard', NOW)
        assert fields['interval_days'] == 1  # max(1, 0 * 1.2)
        assert fields['reps'] == 0
        assert fields['ease'] == pytest.approx(DEFAULT_EASE - 0.15)

    def test_new_card_again_lapses(self):
        fields = apply_sm2(FakeCard(), 'again', NOW)
        assert fields['reps'] == 0
        assert fields['lapses'] == 1
        assert fields['interval_days'] == LAPSE_INTERVAL_DAYS
        # Same-day relearn: due again in a few hours, well before tomorrow.
        assert fields['due_at'] == expected_due(LAPSE_INTERVAL_DAYS)
        assert fields['due_at'] < NOW + timedelta(days=1)
        assert fields['ease'] == pytest.approx(DEFAULT_EASE - 0.2)


class TestApplySm2Progression:
    """Good/Good stepping and longer-interval behaviour."""

    def test_second_good_six_days(self):
        card = FakeCard(interval_days=1, reps=1)
        fields = apply_sm2(card, 'good', NOW)
        assert fields['interval_days'] == SECOND_INTERVAL_DAYS
        assert fields['reps'] == 2

    def test_third_good_uses_ease(self):
        card = FakeCard(interval_days=6, ease=2.5, reps=2)
        fields = apply_sm2(card, 'good', NOW)
        assert fields['interval_days'] == 6 * 2.5
        assert fields['reps'] == 3

    def test_easy_multiplies_good_interval(self):
        card = FakeCard(interval_days=6, ease=2.5, reps=2)
        fields = apply_sm2(card, 'easy', NOW)
        assert fields['interval_days'] == pytest.approx(6 * 2.5 * EASY_BONUS)

    def test_hard_grows_interval_slowly(self):
        card = FakeCard(interval_days=10, ease=2.5, reps=3)
        fields = apply_sm2(card, 'hard', NOW)
        assert fields['interval_days'] == 10 * 1.2

    def test_hard_does_not_increment_reps(self):
        card = FakeCard(interval_days=10, reps=3)
        fields = apply_sm2(card, 'hard', NOW)
        assert fields['reps'] == 3


class TestApplySm2Lapse:
    def test_again_resets_progress(self):
        card = FakeCard(interval_days=30, ease=2.5, reps=5, lapses=0)
        fields = apply_sm2(card, 'again', NOW)
        # Learning state resets: next Good starts over at 1 day.
        assert fields['reps'] == 0
        assert fields['lapses'] == 1
        restarted = apply_sm2(FakeCard(**{
            'interval_days': fields['interval_days'],
            'ease': fields['ease'],
            'reps': fields['reps'],
            'lapses': fields['lapses'],
        }), 'good', NOW)
        assert restarted['interval_days'] == FIRST_INTERVAL_DAYS


class TestEaseFloor:
    @pytest.mark.parametrize('rating,delta', [
        ('again', -0.2),
        ('hard', -0.15),
    ])
    def test_ease_never_drops_below_min(self, rating, delta):
        card = FakeCard(ease=MIN_EASE)
        fields = apply_sm2(card, rating, NOW)
        assert fields['ease'] == MIN_EASE

    def test_repeated_again_keeps_floor(self):
        card = FakeCard(ease=1.35)
        first = apply_sm2(card, 'again', NOW)
        second = apply_sm2(FakeCard(ease=first['ease'], lapses=1), 'again', NOW)
        assert second['ease'] == MIN_EASE


class TestInvalidInput:
    @pytest.mark.parametrize('rating', ['', 'Again', 'GOOD', 'ok', None, 3])
    def test_invalid_rating_raises(self, rating):
        with pytest.raises(ValueError):
            apply_sm2(FakeCard(), rating, NOW)


class TestPurity:
    def test_does_not_mutate_card(self):
        card = FakeCard(interval_days=6, ease=2.5, reps=2)
        apply_sm2(card, 'good', NOW)
        assert card.interval_days == 6
        assert card.reps == 2
        assert card.ease == 2.5
