from rest_framework.decorators import api_view, permission_classes
from django.http import JsonResponse, HttpResponseRedirect
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import render
import environ

from bots.models import TeenEmailMapping

env = environ.Env(
    DEBUG=(bool, False)
)

environ.Env.read_env('.env')

def get_delegated_tokens(user, teen_profile):
    """Generate JWT tokens for the parent account (delegated login)."""
    parent_user = teen_profile.user
    refresh = RefreshToken.for_user(parent_user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'active_profile_id': str(teen_profile.profile_id),
        'is_teen_delegated': True
    }

@api_view(['GET'])
@permission_classes([AllowAny])
def start_web_login(self):
    response = HttpResponseRedirect('/api/accounts/google/auto-login/')
    response.set_cookie('from-web', 'true')
    return response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_jwt(request):
    
    user = request.user

    try:
        mapping = TeenEmailMapping.objects.select_related('teen_profile', 'parent_account').get(
            oauth_email=user.email
        )
        response_data = get_delegated_tokens(user, mapping.teen_profile)
    except TeenEmailMapping.DoesNotExist:
        refresh = RefreshToken.for_user(user)
        response_data = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
        
    if 'json' in request.query_params:
        return JsonResponse(response_data)

    return render(request, 'jwt_template.html', {'app_deep_url': env('APP_DEEP_URL'), 'access': response_data['access'], 'refresh': response_data['refresh']})
