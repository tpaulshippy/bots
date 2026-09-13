"""Gamification stats for one profile (kid), fed by chat + flashcard use.

A "day" is a UTC calendar date with at least one user chat message or one
flashcard review. Streaks count consecutive active days ending today (or
yesterday when today is still quiet, so an evening learner at 9am doesn't
wake up to a broken streak).
"""
from collections import Counter
from datetime import timedelta
from datetime import timezone as dt_timezone

from django.utils import timezone

from bots.models import Chat, FlashcardReview, Message


def _active_dates(profile):
    """Sorted list of distinct UTC dates with chat or study activity."""
    dates = set()
    message_days = (
        Message.objects.filter(chat__profile=profile, role='user')
        .datetimes('created_at', 'day', order='ASC', tzinfo=dt_timezone.utc)
    )
    dates.update(dt.date() for dt in message_days)
    review_days = (
        FlashcardReview.objects.filter(profile=profile)
        .datetimes('reviewed_at', 'day', order='ASC', tzinfo=dt_timezone.utc)
    )
    dates.update(dt.date() for dt in review_days)
    return sorted(dates)


def _streaks(active_dates, today):
    """(current, longest) consecutive-day streaks ending at `today`."""
    day_set = set(active_dates)
    longest = 0
    run = 0
    prev = None
    for day in active_dates:
        run = run + 1 if prev is not None and day == prev + timedelta(days=1) else 1
        longest = max(longest, run)
        prev = day

    if today in day_set:
        anchor = today
    elif today - timedelta(days=1) in day_set:
        anchor = today - timedelta(days=1)
    else:
        return 0, longest

    current = 0
    while anchor - timedelta(days=current) in day_set:
        current += 1
    return current, longest


def get_profile_stats(profile, now=None):
    """Stats dict for the gamification card (see StatsViewSet)."""
    now = now or timezone.now()
    today = now.date()

    active_dates = _active_dates(profile)
    current_streak, longest_streak = _streaks(active_dates, today)

    chats = Chat.objects.filter(profile=profile)
    # User messages only: new chats open with an assistant greeting (see
    # bots/signals.py), which must not read as kid activity — this queryset
    # feeds the streak input, the day buckets, chatted_today, and totals
    # alike so they can never disagree.
    messages = Message.objects.filter(chat__profile=profile, role='user')
    reviews = FlashcardReview.objects.filter(profile=profile)

    # Day buckets use explicit UTC ranges: __date truncation happens in
    # TIME_ZONE, which would disagree with `today` (UTC) near midnight.
    # Two queries total (one per model): datetimes come back in UTC, so
    # .date() buckets them exactly as the old per-day range filters did.
    week_start = timezone.datetime(
        today.year, today.month, today.day, tzinfo=dt_timezone.utc
    ) - timedelta(days=6)
    message_counts = Counter(
        created_at.date()
        for created_at in messages.filter(
            created_at__gte=week_start
        ).values_list('created_at', flat=True)
    )
    review_counts = Counter(
        reviewed_at.date()
        for reviewed_at in reviews.filter(
            reviewed_at__gte=week_start
        ).values_list('reviewed_at', flat=True)
    )
    week = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        week.append({
            'date': str(day),
            'messages': message_counts.get(day, 0),
            'reviews': review_counts.get(day, 0),
        })

    return {
        'profile_id': str(profile.profile_id),
        'name': profile.name,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        # Chats the kid actually participated in: the assistant-only welcome
        # chat must not inflate this total (see the messages filter above).
        'total_chats': chats.filter(messages__role='user').distinct().count(),
        'total_messages': messages.count(),
        'total_reviews': reviews.count(),
        'chatted_today': week[-1]['messages'] > 0,
        'studied_today': week[-1]['reviews'] > 0,
        'week': week,
    }
