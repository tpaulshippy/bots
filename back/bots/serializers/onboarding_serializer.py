"""Serializers describing the onboarding bootstrap contract.

These exist for the OpenAPI schema (drf-spectacular cannot infer fields
the view reads via ``request.data.get``). The service layer remains the
source of truth for validation.
"""
from rest_framework import serializers


class OnboardingBootstrapSerializer(serializers.Serializer):
    """POST /api/onboarding/bootstrap body.

    First-run omits profileId/botId (oldest rows are retargeted); review
    reruns pass the pre-filled ids so re-saving updates those exact rows.
    """

    profileName = serializers.CharField(required=False, allow_blank=True)
    botName = serializers.CharField(required=False, allow_blank=True)
    templateName = serializers.CharField(required=False, allow_blank=True)
    pin = serializers.CharField(required=False, allow_blank=True)
    systemPrompt = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    color = serializers.CharField(required=False, allow_blank=True)
    icon = serializers.CharField(required=False, allow_blank=True)
    studentEmail = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    profileId = serializers.UUIDField(required=False)
    botId = serializers.UUIDField(required=False)


class OnboardingBootstrapResponseSerializer(serializers.Serializer):
    """Success shape: echoes exactly which rows the wizard configured."""

    response = serializers.CharField()
    onboardingCompleted = serializers.BooleanField()
    profileId = serializers.UUIDField()
    botId = serializers.UUIDField()
