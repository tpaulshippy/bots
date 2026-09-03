"""Spaced repetition scheduling (SM-2 style) for flashcard reviews.

The math lives here as a pure function so it is unit-testable and
swappable — viewsets must not inline scheduling logic.
"""
from datetime import timedelta

from django.utils import timezone

RATINGS = ('again', 'hard', 'good', 'easy')

# Minimum ease factor (classic SM-2 floor).
MIN_EASE = 1.3
# Default ease for new cards.
DEFAULT_EASE = 2.5
# First interval (days) after learning a new card with Good/Good.
FIRST_INTERVAL_DAYS = 1
# Second interval (days).
SECOND_INTERVAL_DAYS = 6
# Interval (days) after an "Again" lapse; ~4 hours so the card comes
# back the same day without re-entering the current session queue.
LAPSE_INTERVAL_DAYS = 1 / 6
# Ease adjustments per rating.
EASE_DELTA = {
    'again': -0.2,
    'hard': -0.15,
    'good': 0.0,
    'easy': +0.15,
}
# Multiplier applied to the "good" interval for an "easy" rating.
EASY_BONUS = 1.3
# Multiplier for a "hard" review of a card already in review.
HARD_MULTIPLIER = 1.2


def apply_sm2(card, rating, now=None):
    """Return updated scheduling fields for `card` after a review.

    Pure: does not mutate or save `card`. Accepts any object exposing
    ``interval_days``, ``ease``, ``reps`` and ``lapses`` attributes
    (a Flashcard works directly). Returns a dict with:

        due_at, interval_days, ease, reps, lapses, last_reviewed_at

    Sketch:
        again: reset reps, bump lapses, short same-day interval,
               ease down (floored at MIN_EASE)
        hard:  interval = max(1, interval * 1.2), ease down
        good:  1 day -> 6 days -> interval * ease; reps += 1
        easy:  like good * 1.3, ease up; reps += 1
    """
    if rating not in RATINGS:
        raise ValueError(f"Invalid rating: {rating!r}. Expected one of {RATINGS}")

    now = now or timezone.now()

    interval_days = float(getattr(card, 'interval_days', 0) or 0)
    ease = float(getattr(card, 'ease', DEFAULT_EASE))
    reps = int(getattr(card, 'reps', 0) or 0)
    lapses = int(getattr(card, 'lapses', 0) or 0)

    if rating == 'again':
        # Lapse: relearn from scratch.
        reps = 0
        lapses += 1
        interval_days = LAPSE_INTERVAL_DAYS
    elif rating == 'hard':
        interval_days = max(FIRST_INTERVAL_DAYS, interval_days * HARD_MULTIPLIER)
    elif rating == 'good':
        if reps == 0:
            interval_days = FIRST_INTERVAL_DAYS
        elif reps == 1:
            interval_days = SECOND_INTERVAL_DAYS
        else:
            interval_days = interval_days * ease
        reps += 1
    else:  # easy
        if reps == 0:
            interval_days = FIRST_INTERVAL_DAYS
        elif reps == 1:
            interval_days = SECOND_INTERVAL_DAYS
        else:
            interval_days = interval_days * ease
        interval_days *= EASY_BONUS
        reps += 1

    ease = max(MIN_EASE, ease + EASE_DELTA[rating])

    return {
        'due_at': now + timedelta(days=interval_days),
        'interval_days': interval_days,
        'ease': ease,
        'reps': reps,
        'lapses': lapses,
        'last_reviewed_at': now,
    }
