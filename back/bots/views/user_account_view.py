from bots.models.user_account import MAX_COST_DAILY
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from bots.models import Chat, Profile, Bot

@api_view(['POST', 'GET'])
def user_account_view(request):
    user = request.user
    if request.method == "GET":
        timezone = request.query_params.get('timezone')
        if timezone and timezone != user.user_account.timezone:
            user.user_account.timezone = timezone
            user.save()

        accountInfo = {
                'userId': user.id,
                'pin': user.user_account.pin,
                'costForToday': user.user_account.cost_for_today(),
                'maxDailyCost': MAX_COST_DAILY[user.user_account.subscription_level],
                'subscriptionLevel': user.user_account.subscription_level
            }
        return Response(accountInfo)

    pin = request.data.get('pin')
    
    
    user.user_account.pin = pin
    user.save()
    
    return Response({'response': 'ok'})

class DeleteUserAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        return Response({'message': 'User account deleted successfully.'}, status=204)
