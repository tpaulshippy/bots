import uuid

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from bots.models import Deck, Profile

UNKNOWN_UUID = str(uuid.uuid4())
UNKNOWN_INT_ID = 999999


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123'
    )


@pytest.fixture
def auth_client(api_client, test_user):
    refresh = RefreshToken.for_user(test_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def test_deck(test_user):
    profile = Profile.objects.create(user=test_user, name='Test Profile')
    return Deck.objects.create(profile=profile, name='Test Deck')


@pytest.mark.django_db
class TestUnknownObjectLookup:
    """Unknown IDs (UUID or int) should return 404, never 500, for every resource type."""

    @pytest.mark.parametrize('resource', ['bots', 'chats', 'profiles', 'devices', 'decks'])
    @pytest.mark.parametrize('lookup_value', [UNKNOWN_UUID, UNKNOWN_INT_ID], ids=['uuid', 'int'])
    def test_unknown_object_returns_404(self, auth_client, resource, lookup_value):
        response = auth_client.get(f'/api/{resource}/{lookup_value}/')

        assert response.status_code == 404

    @pytest.mark.parametrize('lookup_value', [UNKNOWN_UUID, UNKNOWN_INT_ID], ids=['uuid', 'int'])
    def test_unknown_deck_in_flashcard_list_returns_404(self, auth_client, lookup_value):
        response = auth_client.get(f'/api/decks/{lookup_value}/flashcards.json')

        assert response.status_code == 404

    @pytest.mark.parametrize('lookup_value', [UNKNOWN_UUID, UNKNOWN_INT_ID], ids=['uuid', 'int'])
    def test_unknown_flashcard_returns_404(self, auth_client, test_deck, lookup_value):
        response = auth_client.get(f'/api/decks/{test_deck.deck_id}/flashcards/{lookup_value}/')

        assert response.status_code == 404

    @pytest.mark.parametrize('lookup_value', [UNKNOWN_UUID, UNKNOWN_INT_ID], ids=['uuid', 'int'])
    def test_unknown_chat_in_message_list_returns_404(self, auth_client, lookup_value):
        response = auth_client.get(f'/api/chats/{lookup_value}/messages.json')

        assert response.status_code == 404
