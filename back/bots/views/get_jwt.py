from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication

@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def get_jwt(self):
    # Generate a JWT
    user = self.user
    print(user)
    refresh = RefreshToken.for_user(user)

    response = Response()
    response.data = {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }
    return response
