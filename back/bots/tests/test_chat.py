import pytest
from django.utils import timezone
from mockito import when, unstub, mock, any
from bots.models.chat import Chat
import uuid


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
        chat = Chat(chat_id=chat_id)
        assert str(chat) == str(chat_id)

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
            return Chat.objects.create()
        
        @pytest.fixture
        def ai():
            return mock()
        
        def it_should_add_message_from_ai(chat, ai):
            when(ai).get_response(...).thenReturn("Hi! How can I help you?")
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=ai)
            assert chat.messages.count() == 2
            assert chat.messages.last().text == "Hi! How can I help you?"
            assert chat.messages.last().role == "assistant"
