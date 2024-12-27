from bots.models.chat import MAX_DOLLARS_DAILY
from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat, Profile, Bot

@api_view(['POST', 'GET'])
def user_account(request):
    user = request.user
    if request.method == "GET":
        accountInfo = {
                'pin': user.user_account.pin,
                'costForToday': user.user_account.cost_for_today(),
                'maxDailyCost': MAX_DOLLARS_DAILY
            }
        return Response(accountInfo)

    pin = request.data.get('pin')
    
    user.user_account.pin = pin
    user.save()
    
    return Response({'response': 'ok'})
