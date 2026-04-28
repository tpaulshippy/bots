import pytest
from django.utils import timezone
from django.core.management import call_command
from mockito import when, unstub, mock, ANY
from django.contrib.auth.models import User
from bots.models.chat import Chat
from bots.models.bot import Bot
from bots.models.ai_model import AiModel
from bots.models.deck import Deck
from bots.models.profile import Profile
from bots.models.flashcard import Flashcard
from langchain_core.messages import AIMessage
import uuid



@pytest.mark.django_db
def describe_chat_model():    
    @pytest.fixture
    def load_fixture():
        call_command('loaddata', 'ai_models.json')

    
    def test_chat_creation():
        chat = Chat.objects.create()
        assert chat.chat_id is not None
        assert isinstance(chat.chat_id, uuid.UUID)
        assert chat.created_at is not None
        assert chat.modified_at is not None

    def test_chat_str():
        chat_id = uuid.uuid4()
        chat = Chat(chat_id=chat_id, title="test")
        assert str(chat) == "test"

    def test_chat_auto_fields():
        now = timezone.now()
        when(timezone).now().thenReturn(now)
        chat = Chat.objects.create()
        assert chat.created_at == now
        assert chat.modified_at == now
        unstub()

    def describe_get_response():
        @pytest.fixture
        def chat():
            return Chat.objects.create(user=User.objects.create())
        
        @pytest.fixture
        def ai():
            return mock()
        
        @pytest.fixture
        def ai_output():
            return AIMessage(
                content="Hello! How can I assist you today?",
                usage_metadata={
                    "input_tokens": 1,
                    "output_tokens": 2,
                    "total_tokens": 3
                }
            )
        
        def it_should_add_message_from_ai(load_fixture, chat, ai, ai_output):
            from unittest.mock import patch
            
            mock_model_with_tools = mock()
            when(mock_model_with_tools).invoke(ANY).thenReturn(ai_output)
            
            mock_client = mock()
            when(mock_client).bind_tools(ANY).thenReturn(mock_model_with_tools)
            
            with patch('bots.models.chat.ChatBedrock', return_value=mock_client):
                chat.messages.create(text="Hello", role="user")
                chat.get_response(ai=ai)
                assert chat.messages.count() == 2
                assert chat.messages.last().text == "Hello! How can I assist you today?"
                assert chat.messages.last().role == "assistant"
                assert chat.messages.last().input_tokens == 1
                assert chat.messages.last().output_tokens == 2

        def it_should_use_system_prompt_from_bot(load_fixture, chat, ai, ai_output):
            from unittest.mock import patch
            
            mock_model_with_tools = mock()
            when(mock_model_with_tools).invoke(ANY).thenReturn(ai_output)
            
            mock_client = mock()
            when(mock_client).bind_tools(ANY).thenReturn(mock_model_with_tools)
            
            with patch('bots.models.chat.ChatBedrock', return_value=mock_client):
                chat.bot = Bot(system_prompt = "How can I help you?")
                chat.bot.save()
                chat.messages.create(text="Hello", role="user")
                chat.get_response(ai=ai)
                assert chat.messages.count() == 2
                assert chat.messages.last().text == "Hello! How can I assist you today?"
                assert chat.messages.last().role == "assistant"
                assert chat.messages.last().input_tokens == 1
                assert chat.messages.last().output_tokens == 2
                assert chat.ai.model_id == "us.amazon.nova-lite-v1:0"
        
        def it_should_use_model_from_bot(chat, ai, ai_output):
            from unittest.mock import patch
            
            mock_model_with_tools = mock()
            when(mock_model_with_tools).invoke(ANY).thenReturn(ai_output)
            
            mock_client = mock()
            when(mock_client).bind_tools(ANY).thenReturn(mock_model_with_tools)
            
            with patch('bots.models.chat.ChatBedrock', return_value=mock_client):
                ai_model = AiModel(model_id="my-custom-model")
                ai_model.save()
                chat.bot = Bot(ai_model=ai_model)
                chat.bot.save()
                chat.messages.create(text="Hello", role="user")
                chat.get_response(ai=ai)
                assert chat.messages.count() == 2
                assert chat.messages.last().text == "Hello! How can I assist you today?"
                assert chat.messages.last().role == "assistant"
                assert chat.messages.last().input_tokens == 1
                assert chat.messages.last().output_tokens == 2
                assert chat.ai.model_id == "my-custom-model"

        def it_should_roll_up_input_and_output_tokens_to_chat(load_fixture, chat, ai, ai_output):
            from unittest.mock import patch
            
            mock_model_with_tools = mock()
            when(mock_model_with_tools).invoke(ANY).thenReturn(ai_output)
            
            mock_client = mock()
            when(mock_client).bind_tools(ANY).thenReturn(mock_model_with_tools)
            
            with patch('bots.models.chat.ChatBedrock', return_value=mock_client):
                chat.messages.create(text="Hello", role="user")
                chat.get_response(ai=ai)
                chat.get_response(ai=ai)
                assert chat.input_tokens == 2
                assert chat.output_tokens == 4

        def it_should_rate_limit_if_cost_goes_over_daily_limit(load_fixture, chat, ai, ai_output):
            chat.input_tokens = 142855
            chat.output_tokens = 35715
            chat.save()
            when(ai).invoke(...).thenReturn(ai_output)
            result = chat.get_response(ai=ai)
            assert result == "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."

        def it_should_record_rate_limit_if_cost_goes_over_daily_limit(load_fixture, chat, ai, ai_output):
            chat.input_tokens = 14285500
            chat.output_tokens = 3571500
            chat.user.user_account.subscription_level = 1
            chat.save()
            when(ai).invoke(...).thenReturn(ai_output)
            chat.get_response(ai=ai)
            assert chat.user.user_account.usage_limit_hits.count() == 1
            assert chat.user.user_account.usage_limit_hits.first().total_input_tokens == 14285500
            assert chat.user.user_account.usage_limit_hits.first().total_output_tokens == 3571500
            assert chat.user.user_account.usage_limit_hits.first().subscription_level == 1

        

        def it_should_not_use_web_search_when_disabled(load_fixture, chat, ai, ai_output):
            from unittest.mock import patch
            
            mock_model_with_tools = mock()
            when(mock_model_with_tools).invoke(ANY).thenReturn(ai_output)
            
            mock_client = mock()
            when(mock_client).bind_tools(ANY).thenReturn(mock_model_with_tools)
            
            with patch('bots.models.chat.ChatBedrock', return_value=mock_client):
                bot = Bot.objects.create(
                    user=chat.user,
                    name="Test Bot",
                    enable_web_search=False,
                    system_prompt="You are a helpful assistant."
                )
                chat.bot = bot
                chat.save()
                
                chat.messages.create(text="Hello", role="user")
                result = chat.get_response(ai=ai)
                
                assert result == "Hello! How can I assist you today?"


@pytest.mark.django_db
def test_flashcard_order_increments():
    chat = Chat.objects.create()
    profile = Profile.objects.create(user=chat.user)
    deck = Deck.objects.create(chat=chat, name="Test Deck", profile=profile)
    
    Flashcard.objects.create(deck=deck, front="front0", back="back0", order=0)
    Flashcard.objects.create(deck=deck, front="front1", back="back1", order=1)
    Flashcard.objects.create(deck=deck, front="front2", back="back2", order=2)
    
    card_count = Flashcard.objects.filter(deck=deck).count()
    assert card_count == 3, f"Expected 3 cards, got {card_count}"
    
    orders = list(Flashcard.objects.filter(deck=deck).order_by('order').values_list('order', flat=True))
    assert orders == [0, 1, 2], f"Expected orders [0, 1, 2], got {orders}"
