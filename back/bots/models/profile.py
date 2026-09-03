import uuid

from django.conf import settings
from django.db import models


class Profile(models.Model):
    ACCESS_MODE_CHOICES = [
        ("all", "all"),
        ("allowlist", "allowlist"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True
    )
    profile_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    oauth_email = models.EmailField(max_length=254, null=True, blank=True)

    # Per-profile bot access control (roadmap-09)
    access_mode = models.CharField(
        max_length=16,
        choices=ACCESS_MODE_CHOICES,
        default="all",
    )
    allowed_bots = models.ManyToManyField(
        'Bot',
        blank=True,
        related_name='allowed_profiles',
    )

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['oauth_email'], name='profile_oauth_email_idx'),
        ]
        # One active profile per delegated sign-in email; soft-deleted profiles
        # do not hold the email.
        constraints = [
            models.UniqueConstraint(
                fields=["oauth_email"],
                condition=models.Q(oauth_email__isnull=False) & models.Q(deleted_at__isnull=True),
                name="unique_active_profile_oauth_email",
            )
        ]

    def __str__(self):
        return self.user.email + ' - ' + self.name

    def bot_is_allowed(self, bot):
        """Return True if *bot* is accessible under the current allowlist.

        - access_mode == "all"  → every non-deleted bot is allowed.
        - access_mode == "allowlist" → only bots in the M2M *and* not
          soft-deleted are allowed.
        """
        if bot is None:
            return True
        if bot.deleted_at is not None:
            return False
        if self.access_mode == "all":
            return True
        return self.allowed_bots.filter(pk=bot.pk).exists()


class ProfileSchedule(models.Model):
    """Time-of-day / weekday access window for a profile (roadmap-09)."""

    profile = models.OneToOneField(
        Profile,
        on_delete=models.CASCADE,
        related_name='schedule',
    )
    enabled = models.BooleanField(default=False)
    # List of windows: [{ "dow": 0-6, "start": "07:00", "end": "20:00" }, ...]
    # dow: 0=Sunday … 6=Saturday (Python datetime.weekday offset is Mon=0,
    #       but we use Sun=0 here for human-friendliness in the UI).
    windows_json = models.JSONField(default=list, blank=True)
    block_message = models.CharField(
        max_length=255,
        default="It's outside your chat hours. Try again later or ask a parent.",
    )

    def __str__(self):
        return f"Schedule for {self.profile.name} (enabled={self.enabled})"

    def allows(self, now_utc=None):
        """Return (allowed: bool, blocked_message: str | None).

        ``now_utc`` is a timezone-aware datetime; defaults to
        ``django.utils.timezone.now()``.
        """
        if not self.enabled:
            return True, None

        if now_utc is None:
            from django.utils import timezone
            now_utc = timezone.now()

        import pytz

        # Resolve profile's timezone from UserAccount
        try:
            tz_name = self.profile.user.user_account.timezone
        except Exception:
            tz_name = "UTC"

        try:
            local_tz = pytz.timezone(tz_name)
        except Exception:
            # A bad timezone string must never 500 chat; fall back to UTC.
            local_tz = pytz.UTC
        local_now = now_utc.astimezone(local_tz)

        # Python weekday(): Monday=0 … Sunday=6
        # Our windows use dow: Sunday=0 … Saturday=6
        py_weekday = local_now.weekday()  # Mon=0
        # Convert to Sun=0
        sun_based = (py_weekday + 1) % 7

        current_time = local_now.strftime("%H:%M")

        for window in self.windows_json:
            if window.get("dow") == sun_based:
                start = window.get("start", "00:00")
                end = window.get("end", "23:59")
                # Start inclusive, end exclusive
                if start <= current_time < end:
                    return True, None

        return False, self.block_message
