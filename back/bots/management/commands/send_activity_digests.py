import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from bots.models import Chat, Profile, UserAccount

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Send the daily activity digest push to devices with notify_digest_only "
        "enabled. Cron-friendly (no Celery): wire it from a scheduler per "
        "docs/roadmap/04-parent-conversation-review.md. Users without activity "
        "in the window are skipped so the digest never becomes spam."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours', type=int, default=24,
            help='Activity window in hours (default: 24).',
        )

    def handle(self, *args, **options):
        since = timezone.now() - timedelta(hours=options['hours'])
        accounts = (
            UserAccount.objects
            .filter(user__devices__notify_digest_only=True, user__devices__deleted_at=None)
            .distinct()
        )

        sent = 0
        for account in accounts:
            body = self.digest_body(account, since)
            if not body:
                continue
            for device in account.user.devices.filter(notify_digest_only=True, deleted_at=None):
                try:
                    device.notify_digest(body)
                except Exception:
                    logger.exception(
                        "Digest push failed for device %s; continuing", device.device_id
                    )
                    continue
                sent += 1
                self.stdout.write(f"Digest sent to device {device.device_id}: {body}")

        self.stdout.write(self.style.SUCCESS(f"{sent} digest push(es) sent"))

    def digest_body(self, account, since):
        """'Maya: 3 chats · Sam: 1 chat', or '' when there was no activity."""
        lines = []
        profiles = Profile.objects.filter(user=account.user, deleted_at=None).order_by('id')
        for profile in profiles:
            chat_count = Chat.objects.filter(
                user=account.user,
                profile=profile,
                created_at__gte=since,
            ).count()
            if chat_count > 0:
                lines.append(f"{profile.name or 'Kid'}: {chat_count} chat{'s' if chat_count != 1 else ''}")
        return ' · '.join(lines)
