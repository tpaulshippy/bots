from rest_framework.decorators import api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bots.models.user_account import MAX_COST_DAILY
from bots.permissions import IsParentSession
from bots.tokens import is_teen_delegated


@api_view(['POST', 'GET'])
def user_account_view(request):
    user = request.user
    teen_delegated = is_teen_delegated(request.auth)
    if request.method == "GET":
        timezone = request.query_params.get('timezone')
        if timezone and timezone != user.user_account.timezone:
            user.user_account.timezone = timezone
            user.user_account.save()

        accountInfo = {
                'userId': user.id,
                'pin': user.user_account.pin,
                'costForToday': user.user_account.cost_for_today(),
                'maxDailyCost': MAX_COST_DAILY[user.user_account.subscription_level],
                'subscriptionLevel': user.user_account.subscription_level
            }
        # Never hand the parent PIN to a teen-delegated device.
        if teen_delegated:
            del accountInfo['pin']
        return Response(accountInfo)

    if teen_delegated:
        return Response(
            {'detail': 'Not allowed for teen-delegated sessions.'},
            status=403,
        )

    pin = request.data.get('pin')


    user.user_account.pin = pin
    user.user_account.save()

    return Response({'response': 'ok'})

class DeleteUserAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        if not IsParentSession().has_permission(request, self):
            return Response(
                {'detail': 'Not allowed for teen-delegated sessions.'},
                status=403,
            )

        user = request.user
        user.delete()
        return Response({'message': 'User account deleted successfully.'}, status=204)
