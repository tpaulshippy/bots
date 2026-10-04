"""Nova 2 Lite text-dialect recovery.

Nova 2 Lite intermittently emits its internal tool-call dialect as plain text
instead of a Converse toolUse block; Bedrock reports the turn with stopReason
"malformed_tool_use" and leaves the payload intact in the text
(vercel/ai#16926, closed as not planned upstream). Prod impact: the raw
`<__function=save_html_page>...` markup streamed to the kid's screen and was
persisted into bots_message.

Covered here: marker detection (including one split across chunks), parsing,
replay through the normal tool path, and the guarantee that no markup reaches
the client or the message table.
"""
import pytest
from django.contrib.auth.models import User
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.tools import tool as tool_dec

from bots.models import Bot, Chat, HtmlPage, Profile
from bots.services.chat_agent import (
    DIALECT_MARKER,
    DIALECT_REDACTION,
    ChatAgentService,
    _parse_nova_dialect,
)


@tool_dec
def _stub_web_search(query: str) -> str:
    """Search the web."""
    return "- Lucid dreaming: techniques"

PAGE_HTML = "<html><body><h1>Lucid Dreaming</h1></body></html>"

# Exactly the shape prod emitted: prose first, then the dialect in the clear.
DIALECT_TURN = (
    "Lucid dreaming is a fun experience. "
    "<tools>\n"
    "  <__function=save_html_page>\n"
    "    <__parameter=title>Lucid Dreaming Guide</__parameter>\n"
    "    <__parameter=html>" + PAGE_HTML + "</__parameter>\n"
    "  </__function>\n"
    "</tools>"
)


def _text_chunk(text, stop_reason=None):
    kwargs = {"content": [{"type": "text", "text": text, "index": 0}]}
    if stop_reason:
        kwargs["response_metadata"] = {"stopReason": stop_reason}
    return AIMessageChunk(**kwargs)


class DialectStreamClient:
    """Streams one dialect turn (chunked), then a normal prose turn."""

    def __init__(self, dialect_chunks=None):
        self.calls = 0
        self._dialect_chunks = dialect_chunks

    def bind_tools(self, tools):
        return self

    def _script(self):
        self.calls += 1
        if self.calls == 1:
            return self._dialect_chunks or [
                _text_chunk(DIALECT_TURN),
                _text_chunk("", "malformed_tool_use"),
            ]
        return [_text_chunk("Saved it!"), _text_chunk("", "end_turn")]

    def stream(self, message_list):
        yield from self._script()

    def invoke(self, message_list):
        merged = None
        for chunk in self._script():
            merged = chunk if merged is None else merged + chunk
        return AIMessage(
            content=merged.content,
            additional_kwargs={},
            tool_calls=[],
        ).model_copy(update={"response_metadata": merged.response_metadata})


@pytest.fixture
def user(db):
    return User.objects.create_user(username="dialect", email="d@example.com", password="p")


@pytest.fixture
def profile(user):
    from bots.models import AiModel
    AiModel.objects.create(
        model_id="us.amazon.nova-2-lite-v1:0", name="Nova 2 Lite",
        is_default=True, supported_input_modalities=["text"],
    )
    return Profile.objects.create(user=user, name="Kid")


def _chat(profile):
    bot = Bot.objects.create(user=profile.user, name="Web", enable_html_pages=True)
    chat = Chat.objects.create(user=profile.user, profile=profile, bot=bot, title="t")
    chat.messages.create(text="Make a lucid dreaming page", role="user")
    return chat


def _tokens(events):
    return "".join(e["text"] for e in events if e["type"] == "token")


@pytest.mark.django_db
def describe_parse_nova_dialect():
    def it_parses_name_and_parameters():
        calls, cleaned = _parse_nova_dialect(DIALECT_TURN)
        assert calls == [("save_html_page", {
            "title": "Lucid Dreaming Guide", "html": PAGE_HTML,
        })]
        assert DIALECT_MARKER not in cleaned

    def it_strips_the_tools_wrapper_and_keeps_prose():
        _, cleaned = _parse_nova_dialect(DIALECT_TURN)
        assert cleaned == "Lucid dreaming is a fun experience."

    def it_parses_without_a_closing_tag():
        # Nova truncates the dialect when it runs out of tokens mid-call.
        calls, _ = _parse_nova_dialect(
            "<__function=save_html_page><__parameter=title>Dino</__parameter><__parameter=html><html></html>"
        )
        assert calls == [("save_html_page", {"title": "Dino", "html": "<html></html>"})]

    def it_recovers_every_call_in_the_turn():
        # Stripping markup for a call we never execute would silently drop it.
        calls, _ = _parse_nova_dialect(
            "<tools>"
            "<__function=web_search><__parameter=query>dreams</__parameter></__function>"
            "<__function=save_html_page><__parameter=title>Dino</__parameter></__function>"
            "</tools>"
        )
        assert [name for name, _ in calls] == ["web_search", "save_html_page"]
        assert calls[1][1] == {"title": "Dino"}

    def it_drops_prose_that_follows_the_dialect():
        # Streaming suppresses everything from the marker on, so replayed context
        # must not reintroduce it.
        _, cleaned = _parse_nova_dialect(
            DIALECT_TURN + "  And here is your page!"
        )
        assert "And here is your page!" not in cleaned
        assert cleaned == "Lucid dreaming is a fun experience."

    def it_decodes_json_containers_but_leaves_html_alone():
        calls, _ = _parse_nova_dialect(
            '<__function=create_flashcard_deck>'
            '<__parameter=name>Bio</__parameter>'
            '<__parameter=flashcards>[{"front": "a", "back": "b"}]</__parameter>'
            '</__function>'
        )
        assert calls[0][1]["flashcards"] == [{"front": "a", "back": "b"}]

    def it_returns_none_for_normal_text():
        assert _parse_nova_dialect("Just a normal reply about dreams.") is None

    def it_returns_none_for_an_empty_call():
        assert _parse_nova_dialect("<__function=save_html_page></__function>") is None


@pytest.mark.django_db
def describe_malformed_turn_in_stream():
    def it_executes_the_recovered_call_and_hides_the_markup(profile):
        chat = _chat(profile)
        events = list(chat.stream_response(ai=DialectStreamClient()))

        assert [e["tool"] for e in events if e["type"] == "tool_start"] == ["save_html_page"]
        assert HtmlPage.objects.count() == 1
        assert HtmlPage.objects.get().title == "Lucid Dreaming Guide"

        streamed = _tokens(events)
        assert DIALECT_MARKER not in streamed
        assert "<__parameter=" not in streamed
        assert "<!DOCTYPE" not in streamed

    def it_persists_no_markup(profile):
        chat = _chat(profile)
        list(chat.stream_response(ai=DialectStreamClient()))

        saved = chat.messages.filter(role="assistant").first()
        assert DIALECT_MARKER not in saved.text
        assert "<__parameter=" not in saved.text
        # The page chip still lands, so the kid gets the page affordance.
        assert any(e.get("kind") == "page" for e in saved.agent_events)

    def it_keeps_preamble_that_streamed_before_the_marker(profile):
        # The common shape: providers stream incrementally, so prose arrives in
        # its own chunk and is emitted before the dialect shows up.
        chat = _chat(profile)
        chunks = [
            _text_chunk("Lucid dreaming is a fun experience. "),
            _text_chunk("<tools><__function=save_html_page>"),
            _text_chunk("<__parameter=title>Lucid Dreaming Guide</__parameter>"),
            _text_chunk("<__parameter=html>" + PAGE_HTML + "</__parameter></__function></tools>"),
            _text_chunk("", "malformed_tool_use"),
        ]
        events = list(chat.stream_response(ai=DialectStreamClient(dialect_chunks=chunks)))
        streamed = _tokens(events)

        assert "Lucid dreaming is a fun experience." in streamed
        assert DIALECT_MARKER not in streamed
        assert HtmlPage.objects.count() == 1

    def it_keeps_preamble_that_shared_the_markers_chunk(profile):
        # Preamble before the marker is real content, so it survives whether or
        # not it shares a chunk with the markup.
        chat = _chat(profile)
        events = list(chat.stream_response(ai=DialectStreamClient()))
        streamed = _tokens(events)

        assert "Lucid dreaming is a fun experience." in streamed
        assert DIALECT_MARKER not in streamed
        assert "Saved it!" in streamed
        assert HtmlPage.objects.count() == 1

    def it_never_leaks_the_tools_wrapper(profile):
        # The wrapper sits between preamble and marker, so it used to ride along
        # in the emitted prefix as raw markup.
        chat = _chat(profile)
        streamed = _tokens(list(chat.stream_response(ai=DialectStreamClient())))
        assert "<tools>" not in streamed
        assert "</tools>" not in streamed

    def it_drops_prose_that_follows_the_dialect(profile):
        # Documented behavior: everything from the marker onward is suppressed,
        # including genuine prose the model wrote after the markup. Not ideal,
        # but we cannot un-stream, so the trade is deliberate.
        chat = _chat(profile)
        chunks = [
            _text_chunk("Here you go. <tools><__function=save_html_page>"),
            _text_chunk("<__parameter=title>Dino</__parameter>"),
            _text_chunk("<__parameter=html>" + PAGE_HTML + "</__parameter></__function></tools>"),
            _text_chunk(" Hope that helps!"),
            _text_chunk("", "malformed_tool_use"),
        ]
        streamed = _tokens(list(chat.stream_response(ai=DialectStreamClient(dialect_chunks=chunks))))

        assert "Here you go." in streamed
        assert "Hope that helps!" not in streamed
        assert DIALECT_MARKER not in streamed
        assert HtmlPage.objects.count() == 1

    def it_catches_a_marker_split_across_chunks(profile):
        chat = _chat(profile)
        chunks = [
            _text_chunk("Sure thing. <__functi"),
            _text_chunk("on=save_html_page><__parameter=title>Dino"),
            _text_chunk("</__parameter><__parameter=html>" + PAGE_HTML + "</__parameter></__function>"),
            _text_chunk("", "malformed_tool_use"),
        ]
        events = list(chat.stream_response(ai=DialectStreamClient(dialect_chunks=chunks)))

        assert [e["tool"] for e in events if e["type"] == "tool_start"] == ["save_html_page"]
        assert DIALECT_MARKER not in _tokens(events)
        assert HtmlPage.objects.get().title == "Dino"

    def it_still_streams_normal_turns_verbatim(profile):
        chat = _chat(profile)
        client = DialectStreamClient(dialect_chunks=[_text_chunk("Plain reply."), _text_chunk("", "end_turn")])
        events = list(chat.stream_response(ai=client))
        assert "Plain reply." in _tokens(events)
        assert HtmlPage.objects.count() == 0


def it_executes_every_call_when_the_turn_contains_several(profile, monkeypatch):
        chat = _chat(profile)
        monkeypatch.setattr(
            ChatAgentService, "_create_web_search_tool",
            lambda self: _stub_web_search(),
        )
        chunks = [
            _text_chunk("<tools>"),
            _text_chunk("<__function=web_search><__parameter=query>lucid dreaming</__parameter></__function>"),
            _text_chunk("<__function=save_html_page><__parameter=title>Dino</__parameter>"),
            _text_chunk("<__parameter=html>" + PAGE_HTML + "</__parameter></__function></tools>"),
            _text_chunk("", "malformed_tool_use"),
        ]
        events = list(chat.stream_response(ai=DialectStreamClient(dialect_chunks=chunks)))

        # Both run. Stripping the second call's markup without executing it would
        # have produced neither chip.
        assert [e["tool"] for e in events if e["type"] == "tool_start"] == [
            "web_search", "save_html_page",
        ]
        assert HtmlPage.objects.count() == 1
        assert "<tools>" not in _tokens(events)


@pytest.mark.django_db
def describe_unparsable_malformed_turn():
    def it_redacts_rather_than_returning_markup(profile):
        # Legacy path: unparsable markup would become the final response and be
        # persisted and replayed verbatim.
        chat = _chat(profile)
        client = DialectStreamClient(dialect_chunks=[
            _text_chunk("<tools><__function=mystery_tool></__function></tools>"),
            _text_chunk("", "malformed_tool_use"),
        ])
        text, _usage = ChatAgentService(chat, client).respond([])

        assert DIALECT_MARKER not in text
        assert "mystery_tool" not in text
        assert text == DIALECT_REDACTION

    def it_redacts_on_the_streaming_path_too(profile):
        chat = _chat(profile)
        client = DialectStreamClient(dialect_chunks=[
            _text_chunk("<tools><__function=mystery_tool></__function></tools>"),
            _text_chunk("", "malformed_tool_use"),
        ])
        streamed = _tokens(list(chat.stream_response(ai=client)))

        assert DIALECT_MARKER not in streamed
        assert "mystery_tool" not in streamed


@pytest.mark.django_db
def describe_malformed_turn_in_legacy_loop():
    def it_recovers_the_call_and_saves_the_page(profile):
        chat = _chat(profile)
        client = DialectStreamClient()
        client._dialect_chunks = None
        text, _usage = ChatAgentService(chat, client).respond([])

        assert DIALECT_MARKER not in text
        assert HtmlPage.objects.count() == 1

    def it_ignores_a_normal_invoke_response(profile):
        chat = _chat(profile)
        client = DialectStreamClient()
        client._dialect_chunks = [_text_chunk("Hello there.")]
        text, _usage = ChatAgentService(chat, client).respond([])
        assert text == "Hello there."
        assert HtmlPage.objects.count() == 0