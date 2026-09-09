import logging

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from bots.models import Flashcard

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Send flashcard study-reminder pushes to devices with notify_study_due "
        "enabled. Cron-friendly (no Celery): schedule it a few times a day. "
        "Users with no due cards are skipped so the reminder never becomes "
        "spam, and digest-only devices are skipped so the digest job stays "
        "their single push source."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        # Due cards per deck (only decks of users with opted-in devices matter,
        # but the grouping is cheap enough to compute globally first).
        due_rows = (
            Flashcard.objects.filter(due_at__lte=now)
            .values('deck', 'deck__name', 'deck__deck_id', 'deck__profile__user')
            .annotate(due=Count('pk'))
            .order_by('deck__name')
        )
        by_user = {}
        for row in due_rows:
            by_user.setdefault(row['deck__profile__user'], []).append(row)

        sent = 0
        for user_id, rows in by_user.items():
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                continue
            devices = list(
                user.devices.filter(notify_study_due=True, deleted_at=None)
            )
            if not devices:
                continue
            title, body, data = self.reminder_content(rows)
            for device in devices:
                try:
                    device.notify_study_reminder(title, body, data)
                except Exception:
                    logger.exception(
                        "Study reminder push failed for device %s; continuing",
                        device.device_id,
                    )
                    continue
                sent += 1
                self.stdout.write(f"Study reminder sent to device {device.device_id}: {body}")

        self.stdout.write(self.style.SUCCESS(f"{sent} study reminder push(es) sent"))

    def reminder_content(self, rows):
        """(title, body, data) for one user's due decks.

        A single due deck deep-links straight into its study session; several
        decks link to the deck list instead.
        """
        total = sum(row['due'] for row in rows)
        if len(rows) == 1:
            name = rows[0]['deck__name'] or 'your deck'
            count = rows[0]['due']
            body = (
                f"{count} card{'s' if count != 1 else ''} due "
                f'in "{name}" \u2014 time to review!'
            )
            data = {'target': 'study_due', 'deck_id': str(rows[0]['deck__deck_id'])}
        else:
            body = (
                f"{total} cards due across {len(rows)} decks \u2014 time to review!"
            )
            data = {'target': 'study_due'}
        return ('Study reminder', body, data)
