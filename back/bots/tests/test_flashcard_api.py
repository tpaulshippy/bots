import pytest
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


@pytest.mark.django_db
class TestChatListAPI:
    """Tests for /api/chats.json endpoint"""

    def test_chat_list_returns_paginated_response(self, auth_client, test_profile, test_user, db):
        """Chat list should return {results: [], count: X} format"""
        from bots.models import Chat
        Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get('/api/chats.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"
        assert isinstance(data['results'], list), "results should be an array"

    def test_chat_list_includes_message_count(self, auth_client, test_profile, test_user, db):
        """Chat list should include message_count field"""
        from bots.models import Chat
        Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get('/api/chats.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            chat_data = data['results'][0]
            assert 'message_count' in chat_data, "Chat should have message_count field"

    def test_chat_list_includes_profile_field(self, auth_client, test_profile, test_user, db):
        """Chat list should include profile field"""
        from bots.models import Chat
        Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get('/api/chats.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            chat_data = data['results'][0]
            assert 'profile' in chat_data, "Chat should have profile field"

    def test_chat_list_includes_bot_field(self, auth_client, test_profile, test_user, db):
        """Chat list should include bot field"""
        from bots.models import Chat, Bot, AiModel
        ai_model = AiModel.objects.create(model_id='test-model', name='Test Model')
        bot = Bot.objects.create(user=test_user, name='Test Bot', ai_model=ai_model)
        Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat', bot=bot)
        
        response = auth_client.get('/api/chats.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            chat_data = data['results'][0]
            assert 'bot' in chat_data, "Chat should have bot field"


@pytest.mark.django_db
class TestChatDetailAPI:
    """Tests for /api/chats/{id}/ endpoint"""

    def test_get_chat_by_uuid(self, auth_client, test_profile, test_user, db):
        """Should be able to lookup chat by chat_id (UUID)"""
        from bots.models import Chat
        chat = Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get(f'/api/chats/{chat.chat_id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['title'] == 'Test Chat'

    def test_get_chat_by_integer_id(self, auth_client, test_profile, test_user, db):
        """Should be able to lookup chat by integer ID"""
        from bots.models import Chat
        chat = Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get(f'/api/chats/{chat.id}/')
        
        assert response.status_code == 200
        data = response.json()
        assert data['title'] == 'Test Chat'

    def test_chat_detail_includes_messages(self, auth_client, test_profile, test_user, db):
        """Chat detail should include messages field"""
        from bots.models import Chat
        chat = Chat.objects.create(user=test_user, profile=test_profile, title='Test Chat')
        
        response = auth_client.get(f'/api/chats/{chat.chat_id}/')
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'messages' in data, "Chat detail should have messages field"
        assert 'profile' in data, "Chat detail should have profile field"


@pytest.mark.django_db
class TestBotListAPI:
    """Tests for /api/bots.json endpoint"""

    def test_bot_list_returns_paginated_response(self, auth_client, test_user, db):
        """Bot list should return {results: [], count: X} format"""
        from bots.models import Bot, AiModel
        ai_model = AiModel.objects.create(model_id='test-model', name='Test Model')
        Bot.objects.create(user=test_user, name='Test Bot', ai_model=ai_model)
        
        response = auth_client.get('/api/bots.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"

    def test_bot_list_includes_required_fields(self, auth_client, test_user, db):
        """Bot list should include required fields"""
        from bots.models import Bot, AiModel
        ai_model = AiModel.objects.create(model_id='test-model', name='Test Model')
        Bot.objects.create(user=test_user, name='Test Bot', ai_model=ai_model)
        
        response = auth_client.get('/api/bots.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            bot_data = data['results'][0]
            assert 'name' in bot_data, "Bot should have name field"
            assert 'ai_model' in bot_data, "Bot should have ai_model field"
            assert 'enable_web_search' in bot_data, "Bot should have enable_web_search field"


@pytest.mark.django_db
class TestBotCreateAPI:
    """Tests for POST /api/bots.json endpoint"""

    def test_create_bot_with_ai_model(self, auth_client, test_user, db):
        """Should be able to create bot with ai_model field"""
        from bots.models import AiModel
        AiModel.objects.create(model_id='test-model', name='Test Model')
        
        response = auth_client.post('/api/bots.json', {
            'name': 'New Bot',
            'ai_model': 'test-model',
            'system_prompt': 'You are a helpful assistant.',
        })
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.content}"
        data = response.json()
        assert data['name'] == 'New Bot'

    def test_create_bot_with_web_search(self, auth_client, test_user, db):
        """Should be able to create bot with enable_web_search field"""
        from bots.models import AiModel
        AiModel.objects.create(model_id='test-model', name='Test Model')
        
        response = auth_client.post('/api/bots.json', {
            'name': 'Search Bot',
            'ai_model': 'test-model',
            'system_prompt': 'You are a helpful assistant.',
            'enable_web_search': True,
        })
        
        assert response.status_code == 201
        data = response.json()
        assert data['enable_web_search']


@pytest.mark.django_db
class TestProfileListAPI:
    """Tests for /api/profiles.json endpoint"""

    def test_profile_list_returns_paginated_response(self, auth_client):
        """Profile list should return {results: [], count: X} format"""
        response = auth_client.get('/api/profiles.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"

    def test_profile_list_includes_required_fields(self, auth_client):
        """Profile list should include required fields"""
        response = auth_client.get('/api/profiles.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            profile_data = data['results'][0]
            assert 'profile_id' in profile_data, "Profile should have profile_id field"
            assert 'name' in profile_data, "Profile should have name field"


@pytest.mark.django_db
class TestDeviceListAPI:
    """Tests for /api/devices.json endpoint"""

    def test_device_list_returns_paginated_response(self, auth_client, test_user, db):
        """Device list should return {results: [], count: X} format"""
        from bots.models import Device
        Device.objects.create(user=test_user, notification_token='test-token-1')
        
        response = auth_client.get('/api/devices.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"

    def test_device_list_includes_required_fields(self, auth_client, test_user, db):
        """Device list should include required fields"""
        from bots.models import Device
        Device.objects.create(user=test_user, notification_token='test-token-2')
        
        response = auth_client.get('/api/devices.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            device_data = data['results'][0]
            assert 'device_id' in device_data, "Device should have device_id field"
            assert 'notify_on_new_chat' in device_data, "Device should have notify_on_new_chat field"


@pytest.mark.django_db
class TestDeviceCreateAPI:
    """Tests for POST /api/devices.json endpoint"""

    def test_create_device(self, auth_client, test_user):
        """Should be able to create device"""
        response = auth_client.post('/api/devices.json', {
            'notification_token': 'new-token-123',
            'notify_on_new_chat': True,
            'notify_on_new_message': True,
        })
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.content}"
        data = response.json()
        assert 'device_id' in data, "Device should have device_id field"
        assert data['notification_token'] == 'new-token-123'


@pytest.mark.django_db
class TestAiModelListAPI:
    """Tests for /api/ai_models.json endpoint"""

    def test_ai_model_list_returns_paginated_response(self, auth_client, db):
        """AI model list should return {results: [], count: X} format"""
        from bots.models import AiModel
        AiModel.objects.create(model_id='test-model', name='Test Model')
        
        response = auth_client.get('/api/ai_models.json')
        
        assert response.status_code == 200
        
        data = response.json()
        assert 'results' in data, "Response should have 'results' key for pagination"
        assert 'count' in data, "Response should have 'count' key for pagination"

    def test_ai_model_list_includes_required_fields(self, auth_client, db):
        """AI model list should include required fields"""
        from bots.models import AiModel
        AiModel.objects.create(model_id='test-model', name='Test Model')
        
        response = auth_client.get('/api/ai_models.json')
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data['results']) > 0:
            model_data = data['results'][0]
            assert 'model_id' in model_data, "AI Model should have model_id field"
            assert 'name' in model_data, "AI Model should have name field"
            assert 'input_token_cost' in model_data, "AI Model should have input_token_cost field"
            assert 'output_token_cost' in model_data, "AI Model should have output_token_cost field"