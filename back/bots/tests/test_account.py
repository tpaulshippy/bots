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

    def describe_reset_daily_usage():
        def it_clears_todays_cost_without_touching_chat_history(load_fixture):
            account = User.objects.create()
            chat = Chat.objects.create(user=account, input_tokens=10, output_tokens=5)
            assert account.user_account.cost_for_today()[1:] == (10, 5)
            account.user_account.reset_daily_usage()
            account.user_account.refresh_from_db()
            assert account.user_account.usage_reset_at is not None
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            chat.refresh_from_db()
            assert (chat.input_tokens, chat.output_tokens) == (10, 5)

        def it_counts_only_chats_after_reset(load_fixture):
            account = User.objects.create()
            Chat.objects.create(user=account, input_tokens=10, output_tokens=5)
            account.user_account.reset_daily_usage()
            Chat.objects.create(user=account, input_tokens=3, output_tokens=4)
            assert account.user_account.cost_for_today()[1:] == (3, 4)

        def it_ignores_prior_day_chats(load_fixture, backdate_modified_at):
            account = User.objects.create()
            old = Chat.objects.create(user=account, input_tokens=50, output_tokens=25)
            backdate_modified_at(old, timezone.now() - timezone.timedelta(days=1))
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)

        def it_only_resets_the_selected_account(load_fixture):
            one = User.objects.create(username='reset-one')
            two = User.objects.create(username='reset-two')
            Chat.objects.create(user=one, input_tokens=10, output_tokens=5)
            Chat.objects.create(user=two, input_tokens=10, output_tokens=5)
            one.user_account.reset_daily_usage()
            one.user_account.refresh_from_db()
            two.user_account.refresh_from_db()
            assert one.user_account.cost_for_today() == (0.0, 0, 0)
            assert two.user_account.cost_for_today()[1:] == (10, 5)

        def it_counts_only_new_tokens_when_a_pre_reset_chat_grows(load_fixture):
            account = User.objects.create()
            chat = Chat.objects.create(user=account, input_tokens=10, output_tokens=5)
            account.user_account.reset_daily_usage()
            chat.input_tokens += 3
            chat.output_tokens += 2
            chat.save()
            assert account.user_account.cost_for_today()[1:] == (3, 2)

        def it_clears_over_limit_after_reset(load_fixture):
            from bots.models.user_account import MAX_COST_DAILY
            account = User.objects.create()
            assert MAX_COST_DAILY[0] == pytest.approx(0.01 / 31)
            Chat.objects.create(user=account, input_tokens=142855, output_tokens=35715)
            assert account.user_account.over_limit() is True
            account.user_account.reset_daily_usage()
            account.user_account.refresh_from_db()
            assert account.user_account.over_limit() is False
