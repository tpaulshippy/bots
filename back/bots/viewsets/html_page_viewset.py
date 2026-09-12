import uuid

from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from bots.models import HtmlPage, Profile
from bots.permissions import IsOwner
from bots.serializers import HtmlPageSerializer
from bots.tokens import delegated_profile_from_auth, is_teen_delegated
from bots.viewsets.mixins import get_object_by_uuid_or_id

# Served verbatim but isolated: scripts run without access to Syft
# origin storage/cookies (no allow-same-origin), no forms, no plugins,
# no top navigation. New-tab + download on the local machine inherit this.
RAW_CSP = "sandbox allow-scripts; object-src 'none'; base-uri 'none'; form-action 'none'"


class HtmlPageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwner]
    serializer_class = HtmlPageSerializer
    queryset = HtmlPage.objects.all()
    lookup_field = "page_id"

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

    def perform_create(self, serializer):
        from rest_framework import serializers as drf_serializers
        user = self.request.user
        if is_teen_delegated(self.request.auth):
            delegated_profile = delegated_profile_from_auth(self.request.auth, user)
            if delegated_profile is None:
                raise drf_serializers.ValidationError("Invalid or unauthorized profile ID")
            serializer.save(profile=delegated_profile, chat=None, bot=None)
            return
        profile_id = self.request.data.get('profile')
        if not profile_id:
            profile = Profile.objects.filter(user=user).first()
            if not profile:
                raise drf_serializers.ValidationError("No profile found for user")
        else:
            try:
                profile = Profile.objects.get(profile_id=uuid.UUID(str(profile_id)), user=user)
            except (ValueError, Profile.DoesNotExist):
                raise drf_serializers.ValidationError("Invalid or unauthorized profile ID")
        serializer.save(profile=profile)

    @action(detail=True, methods=['get'], url_path='raw')
    def raw(self, request, page_id=None):
        """Serve stored HTML for viewing on the local machine's browser.

        Same Django origin as /app/ (no extra host), but CSP `sandbox`
        without `allow-same-origin` puts it in an opaque origin: page JS
        cannot read Syft cookies, localStorage, or parent DOM.
        """
        page = self.get_object()
        response = HttpResponse(page.html, content_type="text/html; charset=utf-8")
        response["Content-Security-Policy"] = RAW_CSP
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "no-referrer"
        response["Cache-Control"] = "private, max-age=60"
        return response
