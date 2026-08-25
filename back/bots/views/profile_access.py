"""GET/PATCH /api/profiles/{profile_id}/access/ and /schedule/ endpoints.

Roadmap-09: per-profile bot allowlists and time-window schedules.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.models import Bot, Profile, ProfileSchedule


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _get_owned_profile(user, profile_id):
    """Return the Profile or raise 404."""
    return get_object_or_404(Profile, profile_id=profile_id, user=user, deleted_at=None)


# ---------------------------------------------------------------------------
# /api/profiles/{profile_id}/access/
# ---------------------------------------------------------------------------

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_access_view(request, profile_id):
    profile = _get_owned_profile(request.user, profile_id)

    if request.method == 'GET':
        bot_ids = list(profile.allowed_bots.values_list('bot_id', flat=True))
        return Response({
            "access_mode": profile.access_mode,
            "bot_ids": [str(b) for b in bot_ids],
        })

    # PATCH
    access_mode = request.data.get('access_mode', profile.access_mode)
    if access_mode not in ('all', 'allowlist'):
        return Response(
            {"error": "access_mode must be 'all' or 'allowlist'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile.access_mode = access_mode

    bot_ids = request.data.get('bot_ids')
    if bot_ids is not None:
        # Validate all bot_ids belong to this user
        bots = Bot.objects.filter(bot_id__in=bot_ids, user=request.user, deleted_at=None)
        if bots.count() != len(bot_ids):
            return Response(
                {"error": "One or more bot_ids are invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.allowed_bots.set(bots)

    profile.save()
    return Response({
        "access_mode": profile.access_mode,
        "bot_ids": list(profile.allowed_bots.values_list('bot_id', flat=True)),
    })


# ---------------------------------------------------------------------------
# /api/profiles/{profile_id}/schedule/
# ---------------------------------------------------------------------------

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_schedule_view(request, profile_id):
    profile = _get_owned_profile(request.user, profile_id)

    schedule, _ = ProfileSchedule.objects.get_or_create(profile=profile)

    if request.method == 'GET':
        return Response({
            "enabled": schedule.enabled,
            "windows": schedule.windows_json,
            "block_message": schedule.block_message,
        })

    # PATCH
    enabled = request.data.get('enabled', schedule.enabled)
    windows = request.data.get('windows', schedule.windows_json)
    block_message = request.data.get('block_message', schedule.block_message)

    # Basic validation
    if not isinstance(windows, list):
        return Response(
            {"error": "windows must be a list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    schedule.enabled = bool(enabled)
    schedule.windows_json = windows
    schedule.block_message = block_message
    schedule.save()

    return Response({
        "enabled": schedule.enabled,
        "windows": schedule.windows_json,
        "block_message": schedule.block_message,
    })
