"""Print JSON learning-analytics summary for one (or all) profiles."""
import json

from django.core.management.base import BaseCommand

from bots.models import FlashcardReview, Message, Profile
from bots.services.learning_analytics import summarize_profile


class Command(BaseCommand):
    help = "Print map-reduce learning analytics summary (Jev features v1) as JSON."

    def add_arguments(self, parser):
        parser.add_argument("--profile-id", default=None, help="Profile.profile_id (UUID). Omit for all profiles.")

    def handle(self, *args, **options):
        profile_id = options.get("profile_id")
        if profile_id:
            profiles = list(Profile.objects.filter(profile_id=profile_id, deleted_at__isnull=True))
            if not profiles:
                self.stderr.write(f"No profile found for profile_id={profile_id}")
                return
        else:
            profiles = list(Profile.objects.filter(deleted_at__isnull=True).order_by("name"))

        results = []
        for profile in profiles:
            # Same inputs as stats.get_profile_stats: user messages + reviews.
            messages = list(
                Message.objects.filter(chat__profile=profile, role="user").order_by("created_at")
            )
            reviews = list(FlashcardReview.objects.filter(profile=profile).order_by("reviewed_at"))
            summary = summarize_profile(messages, reviews)
            summary["profile_id"] = str(profile.profile_id)
            summary["name"] = profile.name
            results.append(summary)

        payload = results[0] if (profile_id and len(results) == 1) else results
        self.stdout.write(json.dumps(payload, indent=2, default=str))
