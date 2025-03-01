from rest_framework.decorators import api_view, authentication_classes, permission_classes
from django.http import JsonResponse, HttpResponseRedirect, HttpResponse
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import render
import environ

# Initialize environ
env = environ.Env(
    DEBUG=(bool, False)  # Set default values and casting types
)

# Read from .env file
environ.Env.read_env('.env')

@api_view(['GET'])
@permission_classes([AllowAny])
def start_web_login(self):
    response = HttpResponseRedirect('/accounts/google/auto-login/')
    response.set_cookie('from-web', 'true')
    return response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_jwt(request):
    
    user = request.user

    refresh = RefreshToken.for_user(user)

    response_data = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }
        
    if 'json' in request.query_params:
        return JsonResponse(response_data)

    return render(request, 'jwt_template.html', {'app_deep_url': env('APP_DEEP_URL'), 'access': str(refresh.access_token), 'refresh': str(refresh)})
