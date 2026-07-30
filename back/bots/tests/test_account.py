import pytest
from django.contrib.auth.models import User
from django.utils import timezone

from bots.models.ai_model import AiModel
from bots.models.bot import Bot
from bots.models.chat import Chat


@pytest.mark.django_db
def describe_account():
    def test_cost_single_model(load_fixture, backdate_modified_at):
        account = User.objects.create()
        Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        backdate_modified_at(chat3, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)
        
    def test_cost_single_model_in_hawaii(load_fixture, backdate_modified_at):
        account = User.objects.create()
        account.user_account.timezone = 'Pacific/Honolulu'
        Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        backdate_modified_at(chat3, timezone.now().astimezone(timezone.get_fixed_timezone(-600)) - timezone.timedelta(hours=1))
        backdate_modified_at(chat3, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)

    def test_cost_single_model_in_australia(load_fixture, backdate_modified_at):
        account = User.objects.create()
        account.user_account.timezone = 'Australia/Sydney'
        Chat.objects.create(user=account, input_tokens=1, output_tokens=2)
        Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        backdate_modified_at(chat3, timezone.now().astimezone(timezone.get_fixed_timezone(600)) - timezone.timedelta(hours=1))
        backdate_modified_at(chat3, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)
    
    def test_cost_multiple_models(load_fixture, backdate_modified_at):
        account = User.objects.create()
        nova_micro = AiModel.objects.get(model_id='us.amazon.nova-micro-v1:0')
        nova_lite = AiModel.objects.get(model_id='us.amazon.nova-lite-v1:0')
        bot1 = Bot.objects.create(ai_model=nova_micro)
        Chat.objects.create(user=account, bot=bot1, input_tokens=1, output_tokens=2)
        bot2 = Bot.objects.create(ai_model=nova_lite)
        Chat.objects.create(user=account, bot=bot2, input_tokens=3, output_tokens=4)
        chat3 = Chat.objects.create(user=account, 
                                    input_tokens=5, 
                                    output_tokens=6)
        backdate_modified_at(chat3, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.000000035 * 1) + (0.00000014 * 2)
        expected_cost += (0.00000006 * 3) + (0.00000024 * 4)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)
