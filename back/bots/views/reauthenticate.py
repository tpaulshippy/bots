from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from bots.services.parent_reauth import (
    PIN_LOCKOUT_MINUTES,
    is_pin_locked,
    is_teen_delegated,
    issue_parent_session_token,
    register_pin_failure,
    remaining_attempts,
    reset_pin_failures,
    validate_pin,
    verify_pin,
)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reauthenticate(request):
    """POST /api/auth/reauthenticate — verify the parent PIN.

    200 -> {"parentSessionToken": "<jwt>", "expiresAt": "<iso>"}
    400 -> malformed body / no PIN configured
    401 -> {"detail": "Invalid PIN", "remainingAttempts": n}
    403 -> teen-delegated sessions can never reauthenticate
    423 -> {"detail": "PIN locked. Try again later.", "lockedUntil": "<iso>"}
    """
    if is_teen_delegated(request):
        return Response(
            {'detail': 'Teen-delegated sessions cannot reauthenticate as parent.'},
            status=403,
        )

    pin = request.data.get('pin')
    if not validate_pin(pin):
        return Response({'detail': 'PIN must be a string of 4 to 8 digits.'}, status=400)

    account = request.user.user_account
    if not account.pin_hash:
        return Response({'detail': 'No PIN has been set for this account.'}, status=400)

    if is_pin_locked(account):
        return Response(
            {
                'detail': 'PIN locked. Try again later.',
                'lockedUntil': account.pin_locked_until,
            },
            status=423,
        )

    if not verify_pin(account, pin):
        register_pin_failure(account)
        if is_pin_locked(account):
            return Response(
                {
                    'detail': 'PIN locked. Try again later.',
                    'lockedUntil': account.pin_locked_until,
                },
                status=423,
            )
        return Response(
            {'detail': 'Invalid PIN', 'remainingAttempts': remaining_attempts(account)},
            status=401,
        )

    reset_pin_failures(account)
    token, expires_at = issue_parent_session_token(request.user)
    return Response({
        'parentSessionToken': token,
        'expiresAt': expires_at,
    })
