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
    def test_cost_single_model():
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
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == expected_cost
        
    def test_cost_single_model_in_hawaii():
        account = User.objects.create()
        account.user_account.timezone = 'Pacific/Honolulu'
        chat1 = Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        chat2 = Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now().astimezone(timezone.get_fixed_timezone(-600)) - timezone.timedelta(hours=1), chat2.id]
            )
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now() - timezone.timedelta(days=1), chat3.id]
            )
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == expected_cost

    def test_cost_single_model_in_australia():
        account = User.objects.create()
        account.user_account.timezone = 'Australia/Sydney'
        chat1 = Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        chat2 = Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now().astimezone(timezone.get_fixed_timezone(600)) - timezone.timedelta(hours=1), chat2.id]
            )
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now() - timezone.timedelta(days=1), chat3.id]
            )
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == expected_cost
    
    def test_cost_multiple_models():
        account = User.objects.create()
        bot1 = Bot.objects.create(model='us.amazon.nova-micro-v1:0')
        chat1 = Chat.objects.create(user=account, bot=bot1, input_tokens=1, output_tokens=2)
        bot2 = Bot.objects.create(model='us.amazon.nova-lite-v1:0')
        chat2 = Chat.objects.create(user=account, bot=bot2, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE bots_chat SET modified_at = %s WHERE id = %s", 
                [timezone.now() - timezone.timedelta(days=1), chat3.id]
            )
        expected_cost = (0.000000035 * 1) + (0.00000014 * 2)
        expected_cost += (0.00000006 * 3) + (0.00000024 * 4)
        assert account.user_account.cost_for_today() == expected_cost
