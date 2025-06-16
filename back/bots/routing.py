from django.urls import re_path
from .consumers.voice_consumer import VoiceConsumer

# WebSocket URL patterns
websocket_urlpatterns = [
    re_path(r'ws/voice/chat/(?P<chat_id>[^/]+)/$', VoiceConsumer.as_asgi()),
]
