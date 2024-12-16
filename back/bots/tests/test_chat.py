import pytest
from django.utils import timezone
from mockito import when, unstub
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
        def it_should_add_message_from_ai():
            chat = Chat.objects.create()
            chat.messages.create(text="Hello", role="user")
            chat.get_response()
            assert chat.messages.count() == 1
            assert chat.messages.first().text == "Hi! How can I help you?"
            assert chat.messages.first().role == "assistant"
