import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Bot, Chat, Message, Profile


@pytest.fixture
def api_client():
    return APIClient()


def make_auth_client(api_client, user):
    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.mark.django_db
class TestBotListReadOnly:
    """GET /api/bots.json must not create rows (provisioning happens in the signup signal)"""

    def test_get_bots_creates_no_rows_for_existing_user(self, api_client):
        call_command('loaddata', 'ai_models.json')
        user = User.objects.create_user(username='testuser', password='testpass123')

        # Signal provisioned the defaults at user creation
        assert Profile.objects.filter(user=user).count() == 1
        assert Bot.objects.filter(user=user).count() == 1
        assert Chat.objects.filter(user=user).count() == 1
        assert Message.objects.filter(chat__user=user).count() == 2

        response = make_auth_client(api_client, user).get('/api/bots.json')

        assert response.status_code == 200
        data = response.json()
        assert data['count'] == 1
        assert data['results'][0]['name'] == 'Penelope'

        # The GET created nothing
        assert Profile.objects.filter(user=user).count() == 1
        assert Bot.objects.filter(user=user).count() == 1
        assert Chat.objects.filter(user=user).count() == 1
        assert Message.objects.filter(chat__user=user).count() == 2

    def test_get_bots_without_default_model_creates_no_rows(self, api_client):
        user = User.objects.create_user(username='testuser', password='testpass123')

        response = make_auth_client(api_client, user).get('/api/bots.json')

        assert response.status_code == 200
        assert response.json()['count'] == 0
        assert not Bot.objects.filter(user=user).exists()
        assert not Chat.objects.filter(user=user).exists()
