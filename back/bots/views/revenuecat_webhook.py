from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth.models import User
from bots.models import UserAccount
import json
from django.conf import settings

@api_view(['POST'])
@permission_classes([AllowAny])
def revenuecat_webhook(request):
    auth_header = request.headers.get('Authorization')
    expected_auth = settings.REVENUECAT_WEBHOOK_AUTH_HEADER
    
    if not auth_header or auth_header != expected_auth:
        return Response({'error': 'Unauthorized'}, status=401)
    
    event = json.loads(request.body).get('event')
    event_type = event.get('type')
    
    if event_type not in ['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'EXPIRATION', 'TEST']:
        return Response({
            'error': 'Unsupported event type',
            'event_type': event_type
            }, status=400)
    
    app_user_id = event.get('app_user_id')
    
    try:
        user = User.objects.get(id=app_user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
    except ValueError:
        return Response({'error': 'Invalid app_user_id'}, status=404)
    
    entitlements = event.get('entitlements', {})
    subscription_level = 0  # Default to free
    
    if 'plus' in entitlements:
        subscription_level = 2  # Plus
    elif 'basic' in entitlements:
        subscription_level = 1  # Basic
    
    user.user_account.subscription_level = subscription_level
    user.user_account.save()
    
    return Response({'status': 'success'})
