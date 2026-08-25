from urllib.parse import urlencode

import environ
from django.conf import settings
from django.http import HttpResponseRedirect, JsonResponse
from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from bots.models import Profile
from bots.tokens import SyftRefreshToken

from rest_framework_simplejwt.tokens import RefreshToken

env = environ.Env(
    DEBUG=(bool, False)
)

environ.Env.read_env('.env')

def get_delegated_tokens(user, teen_profile):
    """Generate JWT tokens for the parent account (delegated login).

    The teen's OAuth User is only an identity proof: the tokens are issued
    FOR THE PARENT USER (the profile owner) but carry claims locking the
    session to this one teen profile, enforced server-side by
    IsParentSession.
    """
    refresh = SyftRefreshToken.for_delegated_profile(teen_profile.user, teen_profile)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'active_profile_id': str(teen_profile.profile_id),
        'is_teen_delegated': True
    }

@api_view(['GET'])
@permission_classes([AllowAny])
def start_web_login(request):
    provider = request.query_params.get('provider')
    login_path = '/api/accounts/apple/auto-login/' if provider == 'apple' else '/api/accounts/google/auto-login/'
    response = HttpResponseRedirect(login_path)
    response.set_cookie(
        'from-web',
        'true',
        max_age=600,
        httponly=True,
        samesite='Lax',
        secure=not settings.DEBUG,
    )
    return response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_jwt(request):

    user = request.user

    # Case-insensitive match on the delegated sign-in email. Soft-deleted
    # profiles never grant login: no match means the OAuth user takes the
    # normal parent signup/login path below. filter(...).first() also keeps
    # a legacy duplicate from 500ing the login page.
    #
    # A user whose own email is bound as a teen email on their own profile is
    # a parent (invited themselves) - exclude their own profiles so they log
    # in as a parent instead of being silently delegated to that profile.
    teen_profile = Profile.objects.filter(
        oauth_email__iexact=user.email,
        deleted_at__isnull=True,
    ).exclude(user=user).first()

    if teen_profile:
        response_data = get_delegated_tokens(user, teen_profile)
    else:
        refresh = RefreshToken.for_user(user)
        response_data = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }

    if 'json' in request.query_params:
        return JsonResponse(response_data)

    if request.COOKIES.get('from-web') == 'true':
        query = urlencode({
            'access': response_data['access'],
            'refresh': response_data['refresh'],
            'active_profile_id': response_data.get('active_profile_id', ''),
            'is_teen_delegated': str(response_data.get('is_teen_delegated', False)).lower(),
        })
        response = HttpResponseRedirect(f"/app/login?{query}")
        response.delete_cookie('from-web')
        return response

    return render(request, 'jwt_template.html', {
        'app_deep_url': env('APP_DEEP_URL'),
        'access': response_data['access'],
        'refresh': response_data['refresh'],
        'active_profile_id': response_data.get('active_profile_id', ''),
        'is_teen_delegated': str(response_data.get('is_teen_delegated', False)).lower(),
    })
