from rest_framework_simplejwt.authentication import JWTAuthentication
import logging

logger = logging.getLogger('django')

class DebugJWTAuthentication(JWTAuthentication):
    def get_validated_token(self, raw_token):
        try:
            logger.info(f"Raw token received: {raw_token}")

            token = super().get_validated_token(raw_token)
            logger.info(f"Validated token: {token}")
            return token
        except Exception as e:
            logger.error(f"Token validation error: {str(e)}")
            raise