from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat, Profile, Bot

@api_view(['POST', 'GET'])
def user_account(request):
    user = request.user
    if request.method == "GET":
        return Response({'pin': user.user_account.pin})

    pin = request.data.get('pin')    
    
    user.user_account.pin = pin
    user.save()
    
    return Response({'response': 'ok'})
