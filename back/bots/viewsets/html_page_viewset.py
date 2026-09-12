import uuid

from django.core import signing
from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.models import HtmlPage
from bots.permissions import IsOwner
from bots.serializers import HtmlPageSerializer
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id

# Served verbatim but isolated: scripts run without access to Syft
# origin storage/cookies (no allow-same-origin), no forms, no plugins,
# no top navigation, and no network (single-file pages need none).
# New-tab + download on the local machine inherit this.
RAW_CSP = (
    "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; "
    "style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; "
    "font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'"
)

# Short-lived browser handoff for window.open(), which cannot attach the
# app's JWT. Bound to user + page, verified again at raw time.
LINK_SALT = "html-page-raw"
LINK_MAX_AGE_SECONDS = 300


def sign_raw_url(user_id, page_id) -> str:
    """Endpoint-relative signed URL (mounted under /api/ by the router)."""
    token = signing.TimestampSigner(salt=LINK_SALT).sign(f"{user_id}:{page_id}")
    return f"/html-pages/{page_id}/raw/?sig={token}"


class HtmlPageViewSet(viewsets.ModelViewSet):
    """Read API for agent-built pages (plus owner DELETE).

    Writes are disabled here on purpose: creation/updates happen only
    through the agent tools, where the bot opt-in flag and the title/text
    safety filter are enforced. Direct POST/PUT/PATCH would bypass both.
    """

    permission_classes = [IsAuthenticated, IsOwner]
    serializer_class = HtmlPageSerializer
    queryset = HtmlPage.objects.all()
    lookup_field = "page_id"
    http_method_names = ["get", "head", "options", "delete"]

    def get_queryset(self):
        user = self.request.user
        queryset = HtmlPage.objects.filter(profile__user=user)
        delegated_profile = delegated_profile_from_auth(self.request.auth, user)
        if delegated_profile is not None:
            queryset = queryset.filter(profile=delegated_profile)
        elif is_teen_delegated(self.request.auth):
            return HtmlPage.objects.none()
        profile_id = self.request.query_params.get('profileId')
        if profile_id:
            try:
                queryset = queryset.filter(profile__profile_id=uuid.UUID(profile_id))
            except ValueError:
                return HtmlPage.objects.none()
        return queryset.order_by('-created_at')

    def get_object(self):
        obj = get_object_by_uuid_or_id(self.get_queryset(), 'page_id', self.kwargs[self.lookup_field])
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=['get'], url_path='link')
    def link(self, request, page_id=None):
        """Signed raw URL for window.open(), which cannot send the JWT."""
        page = self.get_object()
        return Response({"url": sign_raw_url(request.user.pk, page.page_id)})

    @action(detail=True, methods=['get'], url_path='raw', permission_classes=[])
    def raw(self, request, page_id=None):
        """Serve stored HTML for viewing on the local machine's browser.

        Same Django origin as /app/ (no extra host), but CSP `sandbox`
        without `allow-same-origin` puts it in an opaque origin: page JS
        cannot read Syft cookies, localStorage, or parent DOM, and
        `connect-src 'none'` blocks exfiltration.

        Auth: session/JWT as usual, or a short-lived `?sig=` from `link`
        for browser handoffs that cannot attach headers. Either way the
        page must belong to the caller's profile.
        """
        try:
            page_uuid = uuid.UUID(str(page_id))
        except (ValueError, AttributeError):
            return HttpResponse("Unknown page.", status=404)

        user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
        page = None
        if user is not None:
            page = HtmlPage.objects.filter(
                page_id=page_uuid, profile__user=user,
            ).first()
        if page is None:
            sig = request.query_params.get("sig", "")
            try:
                unsigned = signing.TimestampSigner(salt=LINK_SALT).unsign(
                    sig, max_age=LINK_MAX_AGE_SECONDS
                )
                sig_user_id, _, sig_page_id = unsigned.partition(":")
                if sig_page_id == str(page_uuid):
                    page = HtmlPage.objects.filter(
                        page_id=page_uuid, profile__user__pk=sig_user_id,
                    ).first()
            except (signing.SignatureExpired, signing.BadSignature):
                page = None
        if page is None:
            if user is None:
                return HttpResponse(status=401)
            return HttpResponse(status=404)

        # Teen-delegated sessions stay locked to their claimed profile.
        delegated_profile = delegated_profile_from_auth(
            getattr(request, "auth", None), page.profile.user
        )
        if delegated_profile is not None and page.profile != delegated_profile:
            return HttpResponse(status=404)

        response = HttpResponse(page.html, content_type="text/html; charset=utf-8")
        response["Content-Security-Policy"] = RAW_CSP
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        # Updates keep the same URL by design: never cache, or a reopen
        # within max-age would show pre-update HTML.
        response["Cache-Control"] = "no-store"
        return response
