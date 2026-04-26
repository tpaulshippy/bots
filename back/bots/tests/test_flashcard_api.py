import pytest
import uuid
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from bots.models import Deck, Flashcard, Profile


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_user(db):
    user = User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123'
    )
    return user


@pytest.fixture
def test_profile(test_user):
    return Profile.objects.create(
        user=test_user,
        name='Test Profile'
    )


@pytest.fixture
def auth_client(api_client, test_user):
    refresh = RefreshToken.for_user(test_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.mark.django_db
class TestDeckListAPI:
    """Tests for /api/decks.json endpoint - verify pagination format"""

    def test_deck_list_returns_paginated_response(self, auth_client, test_profile):
        """Deck list should return {results: [], count: X} format, not plain array"""
        response = auth_client.get(f'/api/decks.json?profileId={test_profile.profile_id}')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"
        assert isinstance(data['results'], list), "results should be an array"

    def test_deck_list_includes_card_count_field(self, auth_client, test_profile, db):
        """Deck list should include card_count field"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck',
            description='Test description'
        )
        Flashcard.objects.create(deck=deck, front='Front', back='Back', order=0)
        
        response = auth_client.get(f'/api/decks.json?profileId={test_profile.profile_id}')
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data['results']) > 0
        deck_data = data['results'][0]
        assert 'card_count' in deck_data, "Deck should have card_count field"

    def test_deck_list_includes_profile_field(self, auth_client, test_profile):
        """Deck list should include profile field"""
        response = auth_client.get(f'/api/decks.json?profileId={test_profile.profile_id}')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            deck_data = data['results'][0]
            assert 'profile' in deck_data, "Deck should have profile field"


@pytest.mark.django_db
class TestDeckDetailAPI:
    """Tests for /api/decks/{id}/ endpoint"""

    def test_get_deck_by_uuid(self, auth_client, test_profile, db):
        """Should be able to lookup deck by deck_id (UUID)"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck',
            description='Test description'
        )
        
        response = auth_client.get(f'/api/decks/{deck.deck_id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == 'Test Deck'

    def test_get_deck_by_integer_id(self, auth_client, test_profile, db):
        """Should be able to lookup deck by integer ID"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck',
            description='Test description'
        )
        
        response = auth_client.get(f'/api/decks/{deck.id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == 'Test Deck'

    def test_deck_detail_includes_required_fields(self, auth_client, test_profile, db):
        """Deck detail should include profile and chat fields"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck',
            description='Test description'
        )
        
        response = auth_client.get(f'/api/decks/{deck.deck_id}/')
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'profile' in data, "Deck detail should have profile field"
        assert 'chat' in data, "Deck detail should have chat field"
        assert 'flashcards' in data, "Deck detail should have flashcards field"


@pytest.mark.django_db
class TestDeckCreateAPI:
    """Tests for POST /api/decks.json endpoint"""

    def test_create_deck_with_profile(self, auth_client, test_profile):
        """Should be able to create deck with profile field"""
        response = auth_client.post('/api/decks.json', {
            'name': 'New Deck',
            'description': 'New description',
            'profile': str(test_profile.profile_id),
        })
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.content}"
        data = response.json()
        assert data['name'] == 'New Deck'
        assert data['profile'] == str(test_profile.profile_id)

    def test_create_deck_with_chat(self, auth_client, test_profile, test_user, db):
        """Should be able to create deck with optional chat field"""
        from bots.models import Chat
        chat = Chat.objects.create(user=test_user, title='Test Chat')
        
        response = auth_client.post('/api/decks.json', {
            'name': 'New Deck',
            'description': 'New description',
            'profile': str(test_profile.profile_id),
            'chat': str(chat.chat_id),
        })
        
        assert response.status_code == 201
        data = response.json()
        assert data['chat'] == str(chat.chat_id)


@pytest.mark.django_db
class TestFlashcardListAPI:
    """Tests for /api/decks/{deck_id}/flashcards.json endpoint"""

    def test_flashcard_list_returns_paginated_response(self, auth_client, test_profile, db):
        """Flashcard list should return {results: [], count: X} format"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck'
        )
        
        response = auth_client.get(f'/api/decks/{deck.deck_id}/flashcards.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"


@pytest.mark.django_db
class TestFlashcardDetailAPI:
    """Tests for /api/decks/{deck_id}/flashcards/{id}/ endpoint"""

    def test_get_flashcard_by_uuid(self, auth_client, test_profile, db):
        """Should be able to lookup flashcard by flashcard_id (UUID)"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck'
        )
        flashcard = Flashcard.objects.create(
            deck=deck,
            front='Front',
            back='Back',
            order=0
        )
        
        response = auth_client.get(f'/api/decks/{deck.deck_id}/flashcards/{flashcard.flashcard_id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['front'] == 'Front'

    def test_get_flashcard_by_integer_id(self, auth_client, test_profile, db):
        """Should be able to lookup flashcard by integer ID"""
        deck = Deck.objects.create(
            profile=test_profile,
            name='Test Deck'
        )
        flashcard = Flashcard.objects.create(
            deck=deck,
            front='Front',
            back='Back',
            order=0
        )
        
        response = auth_client.get(f'/api/decks/{deck.deck_id}/flashcards/{flashcard.id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['front'] == 'Front'


@pytest.mark.django_db
class TestAPIErrorResponses:
    """Tests for error response formats"""

    def test_empty_list_returns_paginated_format(self, auth_client, test_profile):
        """Empty list should still return paginated format"""
        response = auth_client.get(f'/api/decks.json?profileId={test_profile.profile_id}')
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['results'] == []
        assert data['count'] == 0