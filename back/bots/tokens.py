from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Profile


class SyftRefreshToken(RefreshToken):
    """Refresh token carrying Syft session claims.

    Parent tokens omit the delegated claims entirely. Access tokens inherit
    the custom claims from the refresh token, so a whole session (refresh +
    access) is consistently flagged as teen-delegated or not.
    """

    @classmethod
    def for_delegated_profile(cls, parent_user, profile):
        """Issue a parent-user token locked to one teen profile."""
        token = cls.for_user(parent_user)
        token["is_teen_delegated"] = True
        token["active_profile_id"] = str(profile.profile_id)
        return token


def is_teen_delegated(auth) -> bool:
    """True when the request's validated JWT is a teen-delegated session."""
    return bool(auth is not None and auth.get("is_teen_delegated"))


def delegated_profile_from_auth(auth):
    """Return the Profile this teen-delegated session is locked to, or None.

    Returns None both for parent sessions and for delegated sessions whose
    claimed profile no longer exists (e.g. soft-deleted after issuing).
    Callers that need to distinguish those cases should use is_teen_delegated.
    """
    if not is_teen_delegated(auth):
        return None
    active_profile_id = auth.get("active_profile_id")
    if not active_profile_id:
        return None
    return Profile.objects.filter(
        profile_id=active_profile_id, deleted_at__isnull=True
    ).first()
