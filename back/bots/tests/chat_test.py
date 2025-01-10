import pytest
from django.utils import timezone
from mockito import when, unstub, mock
from django.contrib.auth.models import User
from bots.models.chat import Chat
from bots.models.bot import Bot
import uuid
from ai_fixtures import get_ai_output
from langchain.schema import HumanMessage, SystemMessage, AIMessage


@pytest.mark.django_db
def describe_chat_model():
    
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
            class Output:
                content = "Hello! How can I assist you today?"
                usage_metadata = {
                    "input_tokens": 1,
                    "output_tokens": 2
                }

            output = Output()
            return output
        
        def it_should_add_message_from_ai(chat, ai, ai_output):
            when(ai).invoke([
                SystemMessage("You are chatting with a teen. Please keep the conversation appropriate and respectful. Your responses should be 200 words or less."),
                HumanMessage("Hello")
            ]).thenReturn(ai_output) 
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=ai)
            assert chat.messages.count() == 2
            assert chat.messages.last().text == "Hello! How can I assist you today?"
            assert chat.messages.last().role == "assistant"
            assert chat.messages.last().input_tokens == 1
            assert chat.messages.last().output_tokens == 2

        def it_should_use_system_prompt_from_bot(chat, ai, ai_output):
            chat.bot = Bot(system_prompt = "How can I help you?")
            chat.bot.save()
            when(ai).invoke([
                SystemMessage("How can I help you?"),
                HumanMessage("Hello")
            ]).thenReturn(ai_output) 
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=ai)
            assert chat.messages.count() == 2
            assert chat.messages.last().text == "Hello! How can I assist you today?"
            assert chat.messages.last().role == "assistant"
            assert chat.messages.last().input_tokens == 1
            assert chat.messages.last().output_tokens == 2
            assert chat.ai.model_id == "us.amazon.nova-lite-v1:0"
        
        def it_should_use_model_from_bot(chat, ai, ai_output):
            chat.bot = Bot(model="my-custom-model")
            chat.bot.save()
            when(ai).invoke([
                SystemMessage("You are chatting with a teen. Please keep the conversation appropriate and respectful. Your responses should be 200 words or less."),
                HumanMessage("Hello")
            ]).thenReturn(ai_output) 
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=ai)
            assert chat.messages.count() == 2
            assert chat.messages.last().text == "Hello! How can I assist you today?"
            assert chat.messages.last().role == "assistant"
            assert chat.messages.last().input_tokens == 1
            assert chat.messages.last().output_tokens == 2
            assert chat.ai.model_id == "my-custom-model"

        def it_should_roll_up_input_and_output_tokens_to_chat(chat, ai, ai_output):
            when(ai).invoke(...).thenReturn(ai_output)
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=ai)
            chat.get_response(ai=ai)
            assert chat.input_tokens == 2
            assert chat.output_tokens == 4

        def it_should_rate_limit_if_cost_goes_over_daily_limit(chat, ai, ai_output):
            chat.input_tokens = 142855
            chat.output_tokens = 35715
            chat.save()
            when(ai).invoke(...).thenReturn(ai_output)
            result = chat.get_response(ai=ai)
            assert result == "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription."

        def it_should_record_rate_limit_if_cost_goes_over_daily_limit(chat, ai, ai_output):
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
