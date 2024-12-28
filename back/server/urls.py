"""
URL configuration for server project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.contrib.auth.models import User
from rest_framework import routers
from rest_framework_nested.routers import NestedDefaultRouter
from bots.viewsets.chat_viewset import ChatViewSet, MessageViewSet
from bots.viewsets.profile_viewset import ProfileViewSet
from bots.viewsets.bot_viewset import BotViewSet
from bots.views.get_chat_response import get_chat_response
from bots.views.get_jwt import get_jwt, start_web_login
from bots.views.user_account_view import user_account_view
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


router = routers.DefaultRouter()
router.register(r'chats', ChatViewSet)
router.register(r'profiles', ProfileViewSet)
router.register(r'bots', BotViewSet)

chats_router = NestedDefaultRouter(router, r'chats', lookup='chat')
chats_router.register(r'messages', MessageViewSet, basename='chat-messages')



urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include(router.urls)),
    path('', include(chats_router.urls)),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    path('api/chats/<str:chat_id>', get_chat_response, name='get_chat_response'),
    path('api/login', get_jwt, name='get_jwt'),
    path('api/login/web', start_web_login, name='start_web_login'),
    path('accounts/', include('allauth.urls')),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/user', user_account_view, name='user_account'),
]
