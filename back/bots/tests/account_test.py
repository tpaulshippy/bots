import pytest
from django.utils import timezone
from mockito import when, unstub, mock, any
from bots.models.chat import Chat
from bots.models.bot import Bot
from django.contrib.auth.models import User
from django.db import connection

from ai_fixtures import get_ai_output

@pytest.mark.django_db
def describe_account():
    def test_rate_limit():
        account = User.objects.create()
        chat1 = Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        chat2 = Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now() - timezone.timedelta(days=1), chat3.id]
            )
        expected_cost = (0.000000035 * 4) + (0.00000014 * 6)
        assert account.user_account.cost_for_today('us.amazon.nova-micro-v1:0') == expected_cost
        
        