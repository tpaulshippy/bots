from rest_framework.decorators import api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bots.models.user_account import MAX_COST_DAILY
from bots.permissions import IsParentSession, ParentReauthRequired
from bots.services.parent_reauth import (
    has_valid_parent_reauth,
    hash_pin,
    is_teen_delegated,
    reset_pin_failures,
    validate_pin,
    verify_pin,
)


@api_view(['POST', 'GET'])
def user_account_view(request):
    user = request.user
    if request.method == "GET":
        timezone = request.query_params.get('timezone')
        if timezone and timezone != user.user_account.timezone:
            user.user_account.timezone = timezone
            user.user_account.save()

        # Never return the PIN or its hash — only whether one is set.
        # Legacy compat (old app builds): `pin` is always null — the real
        # value never leaves the server, and `None` keeps old clients from
        # crashing on `account.pin.toString()` during login. `costForToday`
        # preserves the old usage-bar shape. Note: old clients treat
        # `pin: null` as "no PIN", so their local gate may show parent
        # screens without prompting; every parent mutation is still gated
        # server-side by ParentReauthRequired, which old builds cannot
        # satisfy (they send no X-Parent-Reauth header), so nothing can be
        # changed from them. Old builds should still upgrade.
        cost = user.user_account.cost_for_today()[0]
        accountInfo = {
                'userId': user.id,
                'hasPin': bool(user.user_account.pin_hash),
                'pin': None,
                'cost': cost,
                'costForToday': [cost],
                'maxDailyCost': MAX_COST_DAILY[user.user_account.subscription_level],
                'subscriptionLevel': user.user_account.subscription_level,
                'timezone': user.user_account.timezone,
            }
        return Response(accountInfo)

    return set_pin(request)


def _coerce_legacy_pin(value):
    """Accept the legacy integer PIN shape sent by old app builds.

    Old clients POST {"pin": 1234}; the current contract is a string.
    Coerce ints (excluding bools) to their decimal form so first-time
    setup keeps working; anything else passes through to validation.
    """
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    return value


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

    pin = _coerce_legacy_pin(request.data.get('pin'))
    current_pin = _coerce_legacy_pin(request.data.get('currentPin'))

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