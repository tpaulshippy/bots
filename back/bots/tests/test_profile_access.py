"""Tests for roadmap-09: per-profile bot allowlists and schedule enforcement."""
import secrets
import uuid
from datetime import datetime
from unittest.mock import patch

import pytest
import pytz
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Profile, ProfileSchedule

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_user(username="testuser"):
    user = User.objects.create_user(username=username)
    user.set_password(secrets.token_urlsafe())
    return user


def _auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def _make_bot(user, name="TestBot"):
    return Bot.objects.create(user=user, name=name)


def _make_profile(user, name="Kid"):
    return Profile.objects.create(user=user, name=name)


# ---------------------------------------------------------------------------
# Profile.bot_is_allowed tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBotIsAllowed:
    def test_all_mode_returns_true(self):
        user = _make_user()
        profile = _make_profile(user)
        bot = _make_bot(user)

        assert profile.bot_is_allowed(bot) is True

    def test_all_mode_returns_true_for_none_bot(self):
        user = _make_user()
        profile = _make_profile(user)
        assert profile.bot_is_allowed(None) is True

    def test_allowlist_empty_returns_false(self):
        user = _make_user()
        profile = _make_profile(user, name="Kid")
        profile.access_mode = "allowlist"
        profile.save()
        bot = _make_bot(user)

        assert profile.bot_is_allowed(bot) is False

    def test_allowlist_with_bot_returns_true(self):
        user = _make_user()
        profile = _make_profile(user, name="Kid")
        bot = _make_bot(user)
        profile.access_mode = "allowlist"
        profile.allowed_bots.add(bot)
        profile.save()

        assert profile.bot_is_allowed(bot) is True

    def test_soft_deleted_bot_not_allowed(self):
        user = _make_user()
        profile = _make_profile(user, name="Kid")
        bot = _make_bot(user)
        profile.access_mode = "allowlist"
        profile.allowed_bots.add(bot)
        profile.save()

        bot.deleted_at = timezone.now()
        bot.save()

        assert profile.bot_is_allowed(bot) is False

    def test_soft_deleted_bot_not_allowed_in_all_mode(self):
        user = _make_user()
        profile = _make_profile(user)
        bot = _make_bot(user)
        bot.deleted_at = timezone.now()
        bot.save()
        assert profile.bot_is_allowed(bot) is False


# ---------------------------------------------------------------------------
# ProfileSchedule.allows tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScheduleAllows:
    def test_disabled_always_allows(self):
        user = _make_user()
        profile = _make_profile(user)
        schedule = ProfileSchedule.objects.create(
            profile=profile, enabled=False, windows_json=[]
        )
        allowed, msg = schedule.allows()
        assert allowed is True
        assert msg is None

    def test_enabled_outside_window_blocks(self):
        user = _make_user()
        user.user_account.timezone = "US/Eastern"
        user.user_account.save()
        profile = _make_profile(user)
        # Window: Mon-Fri 7:00-20:00
        windows = [{"dow": d, "start": "07:00", "end": "20:00"} for d in range(1, 6)]
        schedule = ProfileSchedule.objects.create(
            profile=profile, enabled=True, windows_json=windows,
            block_message="Bedtime!",
        )
        # Simulate 1am Eastern on a Monday
        eastern = pytz.timezone("US/Eastern")
        fake_now = eastern.localize(datetime(2025, 6, 9, 1, 0, 0)).astimezone(pytz.UTC)
        allowed, msg = schedule.allows(now_utc=fake_now)
        assert allowed is False
        assert msg == "Bedtime!"

    def test_enabled_inside_window_allows(self):
        user = _make_user()
        user.user_account.timezone = "US/Eastern"
        user.user_account.save()
        profile = _make_profile(user)
        windows = [{"dow": d, "start": "07:00", "end": "20:00"} for d in range(1, 6)]
        schedule = ProfileSchedule.objects.create(
            profile=profile, enabled=True, windows_json=windows,
        )
        # 10am Eastern on a Monday
        eastern = pytz.timezone("US/Eastern")
        fake_now = eastern.localize(datetime(2025, 6, 9, 10, 0, 0)).astimezone(pytz.UTC)
        allowed, msg = schedule.allows(now_utc=fake_now)
        assert allowed is True

    def test_start_inclusive_end_exclusive(self):
        """Start time is inclusive, end time is exclusive."""
        user = _make_user()
        user.user_account.timezone = "UTC"
        user.user_account.save()
        profile = _make_profile(user)
        # Mon (dow=1) 07:00-08:00
        windows = [{"dow": 1, "start": "07:00", "end": "08:00"}]
        schedule = ProfileSchedule.objects.create(
            profile=profile, enabled=True, windows_json=windows,
        )
        utc = pytz.UTC
        # Exactly at 07:00 — allowed
        t0700 = utc.localize(datetime(2025, 6, 9, 7, 0, 0))
        allowed, _ = schedule.allows(now_utc=t0700)
        assert allowed is True

        # At 07:59 — still allowed
        t0759 = utc.localize(datetime(2025, 6, 9, 7, 59, 0))
        allowed, _ = schedule.allows(now_utc=t0759)
        assert allowed is True

        # At 08:00 — NOT allowed (end exclusive)
        t0800 = utc.localize(datetime(2025, 6, 9, 8, 0, 0))
        allowed, _ = schedule.allows(now_utc=t0800)
        assert allowed is False

    def test_sunday_window(self):
        """dow=0 is Sunday."""
        user = _make_user()
        user.user_account.timezone = "UTC"
        user.user_account.save()
        profile = _make_profile(user)
        windows = [{"dow": 0, "start": "09:00", "end": "17:00"}]
        schedule = ProfileSchedule.objects.create(
            profile=profile, enabled=True, windows_json=windows,
        )
        utc = pytz.UTC
        # Sunday 10am
        t = utc.localize(datetime(2025, 6, 8, 10, 0, 0))  # June 8 2025 is Sunday
        allowed, _ = schedule.allows(now_utc=t)
        assert allowed is True


# ---------------------------------------------------------------------------
# Chat API enforcement tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestChatAPIAccessEnforcement:
    def test_default_access_allows_bot(self):
        """access_mode='all' (default) allows any bot."""
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        profile = _make_profile(user)
        bot = _make_bot(user)
        client = _auth_client(user)
        chat_count_before = Chat.objects.filter(user=user).count()

        with patch("bots.models.chat.Chat.get_response", return_value="Hi!"):
            response = client.post("/api/chats/new", {
                "message": "hello",
                "profile": str(profile.profile_id),
                "bot": str(bot.bot_id),
            })
        assert response.status_code == 200
        assert "chat_id" in response.json()
        # A new chat was created (beyond any signal-created ones)
        assert Chat.objects.filter(user=user).count() == chat_count_before + 1

    def test_allowlist_blocks_unlisted_bot(self):
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        profile = _make_profile(user)
        profile.access_mode = "allowlist"
        profile.save()
        bot = _make_bot(user, name="BlockedBot")
        client = _auth_client(user)
        chat_count_before = Chat.objects.filter(user=user).count()

        response = client.post("/api/chats/new", {
            "message": "hello",
            "profile": str(profile.profile_id),
            "bot": str(bot.bot_id),
        })
        assert response.status_code == 403
        assert response.json()["code"] == "bot_not_allowed"
        # No new chat was created
        assert Chat.objects.filter(user=user).count() == chat_count_before

    def test_allowlist_permits_listed_bot(self):
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        profile = _make_profile(user)
        bot = _make_bot(user, name="AllowedBot")
        profile.access_mode = "allowlist"
        profile.allowed_bots.add(bot)
        profile.save()
        client = _auth_client(user)
        chat_count_before = Chat.objects.filter(user=user).count()

        with patch("bots.models.chat.Chat.get_response", return_value="Hi!"):
            response = client.post("/api/chats/new", {
                "message": "hello",
                "profile": str(profile.profile_id),
                "bot": str(bot.bot_id),
            })
        assert response.status_code == 200
        assert Chat.objects.filter(user=user).count() == chat_count_before + 1

    def test_schedule_blocks_outside_window(self):
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        user.user_account.timezone = "UTC"
        user.user_account.save()
        profile = _make_profile(user)
        bot = _make_bot(user)
        ProfileSchedule.objects.create(
            profile=profile, enabled=True,
            windows_json=[{"dow": 1, "start": "07:00", "end": "20:00"}],
        )
        client = _auth_client(user)
        chat_count_before = Chat.objects.filter(user=user).count()

        # Freeze time to 1am UTC Monday — outside window
        fake_now = pytz.UTC.localize(datetime(2025, 6, 9, 1, 0, 0))
        with patch("django.utils.timezone.now", return_value=fake_now):
            response = client.post("/api/chats/new", {
                "message": "hello",
                "profile": str(profile.profile_id),
                "bot": str(bot.bot_id),
            })

        assert response.status_code == 200
        assert response.json()["code"] == "outside_schedule"
        # No new chat was created
        assert Chat.objects.filter(user=user).count() == chat_count_before

    def test_schedule_allows_inside_window(self):
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        user.user_account.timezone = "UTC"
        user.user_account.save()
        profile = _make_profile(user)
        bot = _make_bot(user)
        ProfileSchedule.objects.create(
            profile=profile, enabled=True,
            windows_json=[{"dow": 1, "start": "07:00", "end": "20:00"}],
        )
        client = _auth_client(user)
        chat_count_before = Chat.objects.filter(user=user).count()

        fake_now = pytz.UTC.localize(datetime(2025, 6, 9, 10, 0, 0))
        with patch("django.utils.timezone.now", return_value=fake_now), \
             patch("bots.models.chat.Chat.get_response", return_value="Hi!"):
            response = client.post("/api/chats/new", {
                "message": "hello",
                "profile": str(profile.profile_id),
                "bot": str(bot.bot_id),
            })
        assert response.status_code == 200
        assert "chat_id" in response.json()
        assert Chat.objects.filter(user=user).count() == chat_count_before + 1

    def test_other_users_profile_404(self):
        call_command("loaddata", "ai_models.json")
        user_a = _make_user("usera")
        user_b = _make_user("userb")
        profile_a = _make_profile(user_a)
        bot_a = _make_bot(user_a)
        client_b = _auth_client(user_b)

        response = client_b.post("/api/chats/new", {
            "message": "hello",
            "profile": str(profile_a.profile_id),
            "bot": str(bot_a.bot_id),
        })
        assert response.status_code == 404

    def test_no_llm_call_when_blocked(self):
        """Schedule block must not invoke the LLM."""
        call_command("loaddata", "ai_models.json")
        user = _make_user()
        user.user_account.timezone = "UTC"
        user.user_account.save()
        profile = _make_profile(user)
        bot = _make_bot(user)
        ProfileSchedule.objects.create(
            profile=profile, enabled=True,
            windows_json=[{"dow": 1, "start": "07:00", "end": "20:00"}],
        )
        client = _auth_client(user)

        fake_now = pytz.UTC.localize(datetime(2025, 6, 9, 1, 0, 0))
        with patch("django.utils.timezone.now", return_value=fake_now), \
             patch("bots.models.chat.Chat.get_response") as mock_llm:
            response = client.post("/api/chats/new", {
                "message": "hello",
                "profile": str(profile.profile_id),
                "bot": str(bot.bot_id),
            })
            mock_llm.assert_not_called()

        assert response.status_code == 200
        assert response.json()["code"] == "outside_schedule"


# ---------------------------------------------------------------------------
# BotViewSet profileId filter tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBotViewSetProfileFilter:
    def test_profile_id_filters_to_allowed_bots(self):
        user = _make_user()
        profile = _make_profile(user)
        bot_a = _make_bot(user, name="Allowed")
        _make_bot(user, name="Blocked")
        profile.access_mode = "allowlist"
        profile.allowed_bots.add(bot_a)
        profile.save()
        client = _auth_client(user)

        response = client.get(f"/api/bots.json?profileId={profile.profile_id}")
        assert response.status_code == 200
        names = [b["name"] for b in response.json()["results"]]
        assert names == ["Allowed"]

    def test_profile_id_all_mode_returns_all(self):
        user = _make_user()
        profile = _make_profile(user)
        _make_bot(user, name="Bot1")
        _make_bot(user, name="Bot2")
        client = _auth_client(user)

        response = client.get(f"/api/bots.json?profileId={profile.profile_id}")
        assert response.status_code == 200
        assert response.json()["count"] == 2

    def test_invalid_profile_id_returns_empty(self):
        user = _make_user()
        _make_bot(user)
        client = _auth_client(user)

        response = client.get(f"/api/bots.json?profileId={uuid.uuid4()}")
        assert response.status_code == 200
        assert response.json()["count"] == 0


# ---------------------------------------------------------------------------
# Access / Schedule API endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAccessEndpoint:
    def test_get_access(self):
        user = _make_user()
        profile = _make_profile(user)
        client = _auth_client(user)

        response = client.get(f"/api/profiles/{profile.profile_id}/access/")
        assert response.status_code == 200
        data = response.json()
        assert data["access_mode"] == "all"
        assert data["bot_ids"] == []

    def test_patch_access_mode(self):
        user = _make_user()
        profile = _make_profile(user)
        bot = _make_bot(user)
        client = _auth_client(user)

        response = client.patch(
            f"/api/profiles/{profile.profile_id}/access/",
            {"access_mode": "allowlist", "bot_ids": [str(bot.bot_id)]},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["access_mode"] == "allowlist"
        assert str(bot.bot_id) in data["bot_ids"]

    def test_patch_invalid_bot_id(self):
        user = _make_user()
        profile = _make_profile(user)
        client = _auth_client(user)

        response = client.patch(
            f"/api/profiles/{profile.profile_id}/access/",
            {"access_mode": "allowlist", "bot_ids": [str(uuid.uuid4())]},
            format="json",
        )
        assert response.status_code == 400

    def test_other_user_profile_404(self):
        user_a = _make_user("usera")
        user_b = _make_user("userb")
        profile_a = _make_profile(user_a)
        client_b = _auth_client(user_b)

        response = client_b.get(f"/api/profiles/{profile_a.profile_id}/access/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestScheduleEndpoint:
    def test_get_schedule(self):
        user = _make_user()
        profile = _make_profile(user)
        client = _auth_client(user)

        response = client.get(f"/api/profiles/{profile.profile_id}/schedule/")
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is False
        assert data["windows"] == []

    def test_patch_schedule(self):
        user = _make_user()
        profile = _make_profile(user)
        client = _auth_client(user)

        windows = [{"dow": 1, "start": "07:00", "end": "20:00"}]
        response = client.patch(
            f"/api/profiles/{profile.profile_id}/schedule/",
            {"enabled": True, "windows": windows, "block_message": "No chat!"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
        assert data["windows"] == windows
        assert data["block_message"] == "No chat!"

    def test_other_user_profile_404(self):
        user_a = _make_user("usera")
        user_b = _make_user("userb")
        profile_a = _make_profile(user_a)
        client_b = _auth_client(user_b)

        response = client_b.get(f"/api/profiles/{profile_a.profile_id}/schedule/")
        assert response.status_code == 404
