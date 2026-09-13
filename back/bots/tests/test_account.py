from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from langchain_core.messages import AIMessage, AIMessageChunk

from bots.models.ai_model import AiModel
from bots.models.bot import Bot
from bots.models.chat import Chat

HAIKU_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
LITE_ID = 'us.amazon.nova-2-lite-v1:0'


def add_turn(chat, input_tokens, output_tokens, model_id=None):
    """Record one assistant turn the way the chat persist paths do."""
    return chat.messages.create(
        text="reply",
        role="assistant",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model_id=model_id,
    )


@pytest.mark.django_db
def describe_account():
    def test_cost_single_model(load_fixture, backdate_message_created_at):
        account = User.objects.create()
        add_turn(Chat.objects.create(user=account), 1, 2)
        add_turn(Chat.objects.create(user=account), 3, 4)
        old = add_turn(Chat.objects.create(user=account), 5, 6)
        backdate_message_created_at(old, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)

    def test_cost_single_model_in_hawaii(load_fixture, backdate_message_created_at):
        account = User.objects.create()
        account.user_account.timezone = 'Pacific/Honolulu'
        add_turn(Chat.objects.create(user=account), 1, 2)
        add_turn(Chat.objects.create(user=account), 3, 4)
        old = add_turn(Chat.objects.create(user=account), 5, 6)
        backdate_message_created_at(old, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)

    def test_cost_single_model_in_australia(load_fixture, backdate_message_created_at):
        account = User.objects.create()
        account.user_account.timezone = 'Australia/Sydney'
        add_turn(Chat.objects.create(user=account), 1, 2)
        add_turn(Chat.objects.create(user=account), 3, 4)
        old = add_turn(Chat.objects.create(user=account), 5, 6)
        backdate_message_created_at(old, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.00000006 * 4) + (0.00000024 * 6)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)

    def test_cost_multiple_models(load_fixture, backdate_message_created_at):
        # Unstamped rows fall back to the chat's live bot model.
        account = User.objects.create()
        nova_micro = AiModel.objects.get(model_id='us.amazon.nova-micro-v1:0')
        nova_lite = AiModel.objects.get(model_id='us.amazon.nova-lite-v1:0')
        bot1 = Bot.objects.create(ai_model=nova_micro)
        add_turn(Chat.objects.create(user=account, bot=bot1), 1, 2)
        bot2 = Bot.objects.create(ai_model=nova_lite)
        add_turn(Chat.objects.create(user=account, bot=bot2), 3, 4)
        old = add_turn(Chat.objects.create(user=account), 5, 6)
        backdate_message_created_at(old, timezone.now() - timezone.timedelta(days=1))
        expected_cost = (0.000000035 * 1) + (0.00000014 * 2)
        expected_cost += (0.00000006 * 3) + (0.00000024 * 4)
        assert account.user_account.cost_for_today() == (expected_cost, 4, 6)

    def describe_reset_daily_usage():
        def it_clears_todays_cost_without_touching_message_history(load_fixture):
            account = User.objects.create()
            chat = Chat.objects.create(user=account)
            turn = add_turn(chat, 10, 5)
            assert account.user_account.cost_for_today()[1:] == (10, 5)
            account.user_account.reset_daily_usage()
            account.user_account.refresh_from_db()
            assert account.user_account.usage_reset_at is not None
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            turn.refresh_from_db()
            assert (turn.input_tokens, turn.output_tokens) == (10, 5)

        def it_counts_only_turns_after_reset(load_fixture):
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            account.user_account.reset_daily_usage()
            add_turn(Chat.objects.create(user=account), 3, 4)
            assert account.user_account.cost_for_today()[1:] == (3, 4)

        def it_ignores_prior_day_turns(load_fixture, backdate_message_created_at):
            account = User.objects.create()
            old = add_turn(Chat.objects.create(user=account), 50, 25)
            backdate_message_created_at(old, timezone.now() - timezone.timedelta(days=1))
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)

        def it_only_resets_the_selected_account(load_fixture):
            one = User.objects.create(username='reset-one')
            two = User.objects.create(username='reset-two')
            add_turn(Chat.objects.create(user=one), 10, 5)
            add_turn(Chat.objects.create(user=two), 10, 5)
            one.user_account.reset_daily_usage()
            one.user_account.refresh_from_db()
            two.user_account.refresh_from_db()
            assert one.user_account.cost_for_today() == (0.0, 0, 0)
            assert two.user_account.cost_for_today()[1:] == (10, 5)

        def it_counts_only_new_turns_when_a_pre_reset_chat_grows(load_fixture):
            account = User.objects.create()
            chat = Chat.objects.create(user=account)
            add_turn(chat, 10, 5)
            account.user_account.reset_daily_usage()
            add_turn(chat, 3, 2)
            assert account.user_account.cost_for_today()[1:] == (3, 2)

        def it_clears_over_limit_after_reset(load_fixture):
            from bots.models.user_account import MAX_COST_DAILY
            account = User.objects.create()
            assert MAX_COST_DAILY[0] == pytest.approx(0.01 / 31)
            add_turn(Chat.objects.create(user=account), 142855, 35715)
            assert account.user_account.over_limit() is True
            account.user_account.reset_daily_usage()
            account.user_account.refresh_from_db()
            assert account.user_account.over_limit() is False

        def it_ignores_the_baseline_after_a_timezone_change(load_fixture):
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            account.user_account.timezone = 'Pacific/Auckland'
            account.user_account.save(update_fields=['timezone'])
            account.user_account.refresh_from_db()
            assert account.user_account.cost_for_today()[1:] == (10, 5)

        def it_ignores_a_baseline_from_a_previous_local_day(load_fixture):
            from unittest.mock import patch
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            future = timezone.now() + timezone.timedelta(days=2)
            with patch('django.utils.timezone.now', return_value=future):
                add_turn(Chat.objects.create(user=account), 3, 1)
                account.user_account.refresh_from_db()
                assert account.user_account.cost_for_today()[1:] == (3, 1)

        def it_ignores_a_baseline_stamped_by_an_older_computation(load_fixture):
            # A pre-0055 reset baseline measured lifetime Chat counters, not
            # message-based totals; subtracting it could clamp usage to zero
            # for the rest of the day, so it is ignored (conservative: full
            # usage counts again, same as a timezone change).
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            ua = account.user_account
            ua.usage_reset_at = timezone.now()
            ua.usage_reset_timezone = ua.timezone
            ua.usage_reset_cost = 999.0
            ua.usage_reset_input_tokens = 999
            ua.usage_reset_output_tokens = 999
            ua.usage_reset_version = 1
            ua.save()
            assert account.user_account.cost_for_today()[1:] == (10, 5)

        def it_ignores_the_baseline_after_pricing_edits(load_fixture):
            # Rates snapshotted in the baseline no longer match: the
            # recomputed total could fall below the old snapshot and clamp
            # usage to zero, so the baseline is voided (conservative
            # recount, same precedent as a timezone change).
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            lite = AiModel.objects.get(model_id=LITE_ID)
            lite.output_token_cost += 1.0
            lite.save()
            assert account.user_account.cost_for_today()[1:] == (10, 5)

        def it_counts_usage_again_after_a_model_delete(load_fixture):
            # Deleting a model reprices its stamped rows at default rates;
            # without voiding, the baseline captured at the old rates could
            # exceed the recomputed total and clamp usage to zero.
            account = User.objects.create()
            pricey = AiModel.objects.create(
                model_id="pricey-model", name="Pricey",
                input_token_cost=1.0, output_token_cost=2.0,
            )
            chat = Chat.objects.create(user=account)
            add_turn(chat, 10, 5, model_id=pricey.model_id)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            pricey.delete()
            # No refresh: the pricing guard reads live database state, so
            # even this stale in-memory instance stops applying the baseline.
            assert account.user_account.cost_for_today()[1:] == (10, 5)

        def it_keeps_the_reset_version_readonly_in_admin(load_fixture):
            # usage_reset_version is an internal compatibility marker: an
            # operator hand-editing it could re-arm a stale baseline and
            # zero out daily usage, so it must stay admin-readonly like the
            # other reset columns.
            from django.contrib import admin as django_admin

            from bots.admin import MessageAdmin, UserAccountAdmin
            from bots.models.message import Message
            assert 'model_id' in MessageAdmin(Message, django_admin.site).get_readonly_fields(None)
            assert 'input_tokens' in MessageAdmin(Message, django_admin.site).get_readonly_fields(None)
            assert 'output_tokens' in MessageAdmin(Message, django_admin.site).get_readonly_fields(None)
            for field in (
                'usage_reset_at', 'usage_reset_timezone', 'usage_reset_cost',
                'usage_reset_input_tokens', 'usage_reset_output_tokens',
                'usage_reset_version', 'usage_reset_pricing',
            ):
                assert field in UserAccountAdmin.readonly_fields

        def it_keeps_the_baseline_after_cosmetic_model_edits(load_fixture):
            # Renames and modality flags leave the pricing basis equal, so
            # the reset still applies (no re-charge for pre-reset usage).
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 10, 5)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            lite = AiModel.objects.get(model_id=LITE_ID)
            lite.name = "Renamed Lite"
            lite.supported_input_modalities = ["text", "image"]
            lite.save()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)

        def it_voids_the_baseline_when_the_default_changes_under_fallback_rows(load_fixture):
            # Bot-less rows bill at default rates. Switching the default
            # after a reset reprices them, so the old snapshot must not be
            # subtracted (it would clamp usage to zero).
            account = User.objects.create()
            add_turn(Chat.objects.create(user=account), 1000, 500)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            lite = AiModel.objects.get(model_id=LITE_ID)
            micro = AiModel.objects.get(model_id='us.amazon.nova-micro-v1:0')
            lite.is_default = False
            lite.save()
            micro.is_default = True
            micro.save()
            expected = (micro.input_token_cost * 1000) + (micro.output_token_cost * 500)
            assert account.user_account.cost_for_today() == (pytest.approx(expected), 1000, 500)

        def it_voids_the_baseline_when_a_bot_switch_reprices_unstamped_rows(load_fixture):
            # Unstamped rows price from the live bot FK: switching the bot
            # after a reset reprices them, so the old snapshot must not be
            # subtracted (an expensive-to-cheap switch would clamp to zero).
            account = User.objects.create()
            haiku = AiModel.objects.get(model_id=HAIKU_ID)
            lite = AiModel.objects.get(model_id=LITE_ID)
            bot = Bot.objects.create(ai_model=haiku)
            chat = Chat.objects.create(user=account, bot=bot)
            add_turn(chat, 1000, 500)
            account.user_account.reset_daily_usage()
            assert account.user_account.cost_for_today() == (0.0, 0, 0)
            bot.ai_model = lite
            bot.save()
            expected = (lite.input_token_cost * 1000) + (lite.output_token_cost * 500)
            assert account.user_account.cost_for_today() == (pytest.approx(expected), 1000, 500)

    def describe_model_attribution():
        def it_prices_stamped_history_by_stamp_after_a_bot_model_switch(load_fixture):
            # Prod incident: Fred moved Haiku -> Nova 2 Lite mid-day and the
            # whole day repriced to Nova rates, collapsing usage to 0.
            account = User.objects.create()
            haiku = AiModel.objects.get(model_id=HAIKU_ID)
            lite = AiModel.objects.get(model_id=LITE_ID)
            bot = Bot.objects.create(ai_model=haiku)
            chat = Chat.objects.create(user=account, bot=bot)
            add_turn(chat, 1000, 500, model_id=haiku.model_id)
            bot.ai_model = lite
            bot.save()
            add_turn(chat, 1000, 500, model_id=lite.model_id)
            expected = (0.0000008 * 1000) + (0.000004 * 500)
            expected += (0.00000006 * 1000) + (0.00000024 * 500)
            assert account.user_account.cost_for_today() == (pytest.approx(expected), 2000, 1000)

        def it_stamps_the_resolved_model_on_get_response(load_fixture):
            haiku = AiModel.objects.get(model_id=HAIKU_ID)
            bot = Bot.objects.create(ai_model=haiku)
            chat = Chat.objects.create(user=User.objects.create(), bot=bot)
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=fake_client())
            assert chat.messages.last().model_id == HAIKU_ID

        def it_stamps_the_default_model_when_the_bot_has_none(load_fixture):
            chat = Chat.objects.create(user=User.objects.create())
            chat.messages.create(text="Hello", role="user")
            chat.get_response(ai=fake_client())
            assert chat.messages.last().model_id == LITE_ID

        def it_stamps_the_resolved_model_through_stream_response(load_fixture):
            # Exercises resolve_ai_client + the stream persist call site, so
            # a regression that drops the resolved ID there fails here.
            haiku = AiModel.objects.get(model_id=HAIKU_ID)
            bot = Bot.objects.create(ai_model=haiku)
            chat = Chat.objects.create(user=User.objects.create(), bot=bot)
            chat.messages.create(text="Hello", role="user")
            list(chat.stream_response(ai=FakeStreamClient()))
            saved = chat.messages.filter(role="assistant").last()
            assert (saved.model_id, saved.input_tokens, saved.output_tokens) == (HAIKU_ID, 7, 3)

        def it_bills_a_deleted_model_stamp_at_default_rates(load_fixture):
            # A stamp whose AiModel row no longer exists must not vanish; it
            # bills at the default model's rates.
            account = User.objects.create()
            default = AiModel.objects.get(is_default=True)
            doomed = AiModel.objects.create(
                model_id="deleted-model", name="Doomed",
                input_token_cost=1.0, output_token_cost=2.0,
            )
            chat = Chat.objects.create(user=account)
            add_turn(chat, 10, 5, model_id=doomed.model_id)
            doomed.delete()
            expected = (default.input_token_cost * 10) + (default.output_token_cost * 5)
            assert account.user_account.cost_for_today() == (pytest.approx(expected), 10, 5)


def fake_client():
    client = MagicMock()
    client.bind_tools.return_value.invoke.return_value = AIMessage(
        content="Hello! How can I assist you today?",
        usage_metadata={"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
    )
    return client


class FakeStreamClient:
    """Minimal streaming client: one text chunk carrying usage metadata."""

    def bind_tools(self, tools):
        return self

    def stream(self, message_list):
        yield AIMessageChunk(
            content="Hello! How can I assist you today?",
            usage_metadata={"input_tokens": 7, "output_tokens": 3, "total_tokens": 10},
        )
