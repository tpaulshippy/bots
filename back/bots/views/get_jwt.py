from rest_framework.decorators import api_view, authentication_classes, permission_classes
from django.http import JsonResponse, HttpResponseRedirect
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny
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
    response = HttpResponseRedirect('/accounts/google/login/')
    response.set_cookie('from-web', 'true')
    return response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_jwt(self):
    
    user = self.user

    refresh = RefreshToken.for_user(user)

    response_data = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }
    
    
    if self.COOKIES.get('from-web'):
        return HttpResponseRedirect(f'http://localhost:8081?access={response_data["access"]}&refresh={response_data["refresh"]}')
    else:
        HttpResponseRedirect.allowed_schemes.append('exp')
        return HttpResponseRedirect(f'{env("PREVIEW_URL")}?access={response_data["access"]}&refresh={response_data["refresh"]}')

