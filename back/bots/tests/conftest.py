import pytest
from django.core.management import call_command
from django.db import connection


@pytest.fixture
def load_fixture():
    call_command('loaddata', 'ai_models.json')


@pytest.fixture
def backdate_modified_at():
    """Backdate a Chat's auto_now modified_at field via raw SQL (ORM save would overwrite it)."""
    def _backdate(chat, when):
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE bots_chat SET modified_at = %s WHERE id = %s",
                [when, chat.id]
            )
    return _backdate


@pytest.fixture
def backdate_message_created_at():
    """Backdate a Message's auto_now_add created_at field via raw SQL (ORM save would overwrite it)."""
    def _backdate(message, when):
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE bots_message SET created_at = %s WHERE id = %s",
                [when, message.id]
            )
    return _backdate
