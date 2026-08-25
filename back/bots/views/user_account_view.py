from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bots.models.user_account import MAX_COST_DAILY
from bots.permissions import IsParentSession, ParentReauthRequired
from bots.services.onboarding import bootstrap_onboarding
from bots.services.parent_reauth import (
    has_valid_parent_reauth,
    hash_pin,
    is_teen_delegated,
    reset_pin_failures,
    validate_pin,
    verify_pin,
)

TEEN_DELEGATED_DETAIL = 'Onboarding is completed by the parent account.'


def request_is_teen_delegated(request) -> bool:
    """Teen delegated sessions carry the claim added by get_delegated_tokens;
    they must never run or complete onboarding themselves."""
    payload = getattr(request.auth, 'payload', None)
    return bool(payload.get('is_teen_delegated')) if isinstance(payload, dict) else False


@api_view(['POST', 'GET'])
def user_account_view(request):
    user = request.user
    if request.method == "GET":
        timezone = request.query_params.get('timezone')
        if timezone and timezone != user.user_account.timezone:
            user.user_account.timezone = timezone
            user.user_account.save()

        # Never return the PIN or its hash — only whether one is set.
        accountInfo = {
                'userId': user.id,
                'hasPin': bool(user.user_account.pin_hash),
                'cost': user.user_account.cost_for_today()[0],
                'maxDailyCost': MAX_COST_DAILY[user.user_account.subscription_level],
                'subscriptionLevel': user.user_account.subscription_level,
                'timezone': user.user_account.timezone,
                'onboardingCompleted': user.user_account.onboarding_completed(),
            }
        return Response(accountInfo)

    return set_pin(request)


def set_pin(request):
    """POST /api/user — set or change the parent PIN.

    Body: {"pin": "1234", "currentPin": "0000"}
    - First set (no existing PIN): no currentPin or reauth required.
    - Change: requires both a valid parent reauth session and the current PIN.
    """
    account = request.user.user_account

    if is_teen_delegated(request):
        return Response(
            {'detail': 'Teen-delegated sessions cannot manage the parent PIN.'},
            status=403,
        )

    pin = request.data.get('pin')
    current_pin = request.data.get('currentPin')

    if not validate_pin(pin):
        return Response(
            {'detail': 'PIN must be a string of 4 to 8 digits.'},
            status=400,
        )

    changing_pin = bool(account.pin_hash)
    if changing_pin:
        # Changing an existing PIN requires a recent parent reauthentication
        # (first-time setup cannot, since there is nothing to reauthenticate with).
        if not has_valid_parent_reauth(request):
            return Response({'detail': 'Parent reauthentication required.'}, status=403)
        if not verify_pin(account, current_pin or ''):
            return Response({'detail': 'Current PIN is incorrect.'}, status=403)

    account.pin_hash = hash_pin(pin)
    reset_pin_failures(account)
    account.save(update_fields=['pin_hash'])

    return Response({'response': 'ok'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def onboarding_complete_view(request):
    """Mark onboarding complete. Idempotent; teen delegated sessions are 403."""
    if request_is_teen_delegated(request):
        return Response({'detail': TEEN_DELEGATED_DETAIL}, status=403)

    account = request.user.user_account
    if account.onboarding_completed_at is None:
        account.onboarding_completed_at = timezone.now()
        account.save()
    return Response({'response': 'ok', 'onboardingCompleted': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def onboarding_bootstrap_view(request):
    """Atomic wizard save: profile name, first bot, PIN and completion flag."""
    if request_is_teen_delegated(request):
        return Response({'detail': TEEN_DELEGATED_DETAIL}, status=403)

    data = request.data
    result = bootstrap_onboarding(
        request.user,
        profile_name=data.get('profileName'),
        bot_name=data.get('botName'),
        template_name=data.get('templateName'),
        pin=data.get('pin'),
        system_prompt=data.get('systemPrompt'),
        color=data.get('color'),
        icon=data.get('icon'),
    )
    return Response({
        'response': 'ok',
        'onboardingCompleted': True,
        # Let clients select exactly what the wizard configured.
        'profileId': str(result['profile'].profile_id),
        'botId': str(result['bot'].bot_id),
    })


class DeleteUserAccountView(APIView):
    permission_classes = [IsAuthenticated, ParentReauthRequired]

    def delete(self, request):
        if not IsParentSession().has_permission(request, self):
            return Response(
                {'detail': 'Not allowed for teen-delegated sessions.'},
                status=403,
            )

        user = request.user
        user.delete()
        return Response({'message': 'User account deleted successfully.'}, status=204)