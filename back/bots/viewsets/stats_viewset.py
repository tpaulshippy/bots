import uuid

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.models import Profile
from bots.services import stats as stats_service
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id


class StatsViewSet(viewsets.ViewSet):
    """Gamification stats for one profile (kid): streaks + totals fed by both
    chat messages and flashcard reviews.

    Unlike the parent-only activity endpoints, this is visible to the kid too,
    so teen-delegated sessions are locked to their claimed profile instead of
    being denied.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        profile = self._resolve_profile(request)
        if profile is None:
            return Response(
                {'profileId': 'Invalid or unauthorized profile ID.'},
                status=400,
            )
        return Response(stats_service.get_profile_stats(profile))

    def _resolve_profile(self, request):
        delegated_profile = delegated_profile_from_auth(request.auth, request.user)
        if delegated_profile is not None:
            return delegated_profile
        if is_teen_delegated(request.auth):
            return None
        profile_id = request.query_params.get('profileId')
        if not profile_id:
            return None
        try:
            uuid.UUID(str(profile_id))
        except (ValueError, AttributeError, TypeError):
            return None
        # Unknown or foreign profiles raise NotFound (404) instead of leaking
        # existence, mirroring the deck endpoints.
        return get_object_by_uuid_or_id(
            Profile.objects.filter(user=request.user, deleted_at=None),
            'profile_id',
            str(profile_id),
        )
