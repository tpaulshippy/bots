"""Streaming chat tests (roadmap doc 06).

Covers: stream generator event sequence with fake Bedrock-style chunked
responses, disconnect mid-stream saving partial text, the SSE endpoint framing,
over_limit error events, and the legacy POST response gaining `events[]`.
"""
import json
import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from langchain_core.messages import AIMessage, AIMessageChunk
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

import bots.models.chat as chat_module
from bots.models.chat import AiClientWrapper, Chat
from bots.models.deck import Deck
from bots.models.profile import Profile
from bots.services import fake_ai

FINAL_TEXT = "Mitosis has four main stages. First prophase."


def tool_call_chunks_fixture():
    """A create_flashcard_deck call whose JSON args are split across two chunks."""
    return [
        AIMessageChunk(content="", tool_call_chunks=[{
            "name": "create_flashcard_deck",
            "args": '{"name": "Cell Bio", "flashcards": [{"front": "What is mitosis?", "back": "Cell division"}',
            "id": "call-1",
            "index": 0,
            "type": "tool_call_chunk",
        }]),
        AIMessageChunk(content="", tool_call_chunks=[{
            "name": None,
            "args": '], "description": ""}',
            "id": None,
            "index": 0,
            "type": "tool_call_chunk",
        }]),
    ]


class ScriptedStreamClient:
    """Fake Bedrock/LangChain client: iteration 1 emits a split tool call,
    later iterations stream text tokens with usage metadata on the last chunk.
    Implements both .stream() (SSE path) and .invoke() (legacy loop)."""

    def __init__(self):
        self.calls = 0

    def bind_tools(self, tools):
        return self

    def _script_chunks(self):
        self.calls += 1
        if self.calls == 1:
            yield from tool_call_chunks_fixture()
            return
        words = FINAL_TEXT.split(" ")
        for i, word in enumerate(words):
            token = f"{word} "
            if i == len(words) - 1:
                yield AIMessageChunk(
                    content=token,
                    usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
                )
            else:
                yield AIMessageChunk(content=token)

    def stream(self, message_list):
        yield from self._script_chunks()

    def invoke(self, message_list):
        merged = None
        for chunk in self._script_chunks():
            merged = chunk if merged is None else merged + chunk
        return AIMessage(content=merged.content, tool_calls=getattr(merged, "tool_calls", None) or [])


class FakeAiWrapper(AiClientWrapper):
    """AiClientWrapper variant that ignores Bedrock and uses the scripted client."""

    def __init__(self, model_id, client=None):
        self.model_id = model_id
        self.client = ScriptedStreamClient()


def parse_sse_frames(raw):
    """Parse an SSE byte stream into [(event_type, payload_dict), ...]."""
    frames = []
    for block in raw.split("\n\n"):
        event_type = None
        data_lines = []
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_type = line[len("event: "):]
            elif line.startswith("data: "):
                data_lines.append(line[len("data: "):])
        if event_type is not None:
            frames.append((event_type, json.loads("\n".join(data_lines))))
    return frames


@pytest.fixture(autouse=True)
def fast_fake_stream(monkeypatch):
    monkeypatch.setattr(fake_ai, 'TOKEN_PAUSE_SECONDS', 0)


@pytest.fixture
def user(db):
    return User.objects.create_user(username='streamer', email='stream@example.com', password='pass')


@pytest.fixture
def profile(user):
    return Profile.objects.create(user=user, name='Stream Kid')


@pytest.fixture
def chat(user, profile, load_fixture):
    return Chat.objects.create(user=user, profile=profile, title='stream test')


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return client


@pytest.mark.django_db
def describe_agent_stream_generator():
    def it_emits_tokens_tool_events_then_done(chat):
        chat.messages.create(text="Teach me mitosis and make a deck", role="user")

        events = list(chat.stream_response(ai=ScriptedStreamClient()))
        types = [event["type"] for event in events]

        # Iteration 1 is a tool call; tokens stream in iteration 2.
        assert "tool_start" in types
        assert "tool_end" in types
        assert "token" in types
        assert types[-1] == "done"

        tool_start = next(e for e in events if e["type"] == "tool_start")
        assert tool_start["tool"] == "create_flashcard_deck"
        assert tool_start["args"]["name"] == "Cell Bio"

        # Split tool-call args were buffered and executed exactly once.
        tool_end = next(e for e in events if e["type"] == "tool_end")
        assert tool_end["deck_id"]
        assert tool_end["name"] == "Cell Bio"
        assert tool_end["card_count"] == 1

        tokens = "".join(e["text"] for e in events if e["type"] == "token")
        assert FINAL_TEXT in tokens

        done = events[-1]
        assert done["input_tokens"] >= 10
        assert done["output_tokens"] >= 5

    def it_persists_assistant_message_with_usage_and_creates_deck(chat):
        chat.messages.create(text="hello", role="user")

        list(chat.stream_response(ai=ScriptedStreamClient(), message_id=uuid.uuid4()))

        assistant = [m for m in chat.messages.all() if m.role == "assistant"]
        assert len(assistant) == 1
        assert FINAL_TEXT in assistant[0].text
        assert assistant[0].input_tokens == 10
        assert assistant[0].output_tokens == 5

        decks = Deck.objects.filter(name="Cell Bio")
        assert decks.count() == 1
        assert decks.first().deck_id

    def it_records_client_events_for_legacy_payload(chat):
        from bots.services.chat_agent import ChatAgentService

        service = ChatAgentService(chat, ScriptedStreamClient())
        message_list, _contains_image = chat.get_input()
        text, usage = service.respond(message_list)

        assert FINAL_TEXT in text
        deck_event = next(e for e in service.client_events if e.get("tool") == "create_flashcard_deck")
        assert deck_event["deck_id"]
        assert deck_event["name"] == "Cell Bio"
        assert deck_event["card_count"] == 1


@pytest.mark.django_db
def describe_disconnect_mid_stream():
    def it_saves_partial_assistant_text(chat):
        chat.messages.create(text="hello", role="user")

        generator = chat.stream_response(ai=ScriptedStreamClient())
        for event in generator:
            if event["type"] == "token":
                break  # consume exactly one streamed token...
        generator.close()          # ...then the client disconnects

        assistant_messages = [m for m in chat.messages.all() if m.role == "assistant"]
        assert len(assistant_messages) == 1
        saved = assistant_messages[0].text
        assert saved
        assert len(saved.strip()) < len(FINAL_TEXT)


@pytest.mark.django_db
def describe_over_limit():
    def it_emits_single_error_event_and_no_tokens(chat):
        chat.input_tokens = 142855
        chat.output_tokens = 35715
        chat.save()
        chat.messages.create(text="hello", role="user")

        events = list(chat.stream_response(ai=ScriptedStreamClient()))

        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert events[0]["code"] == "over_limit"
        assert not [m for m in chat.messages.all() if m.role == "assistant"]


@pytest.mark.django_db
def describe_sse_endpoint():
    url = '/api/chats/new/stream'

    def test_emits_meta_status_tokens_done(user, profile, load_fixture):
        with patch.object(chat_module, 'AiClientWrapper', FakeAiWrapper):
            response = auth_client(user).post(url, {
                'message': 'Teach me mitosis',
                'profile': str(profile.profile_id),
            }, format='multipart')
            # Consume inside the patch: StreamingHttpResponse generators run
            # lazily when their content is pulled.
            raw = b"".join(response.streaming_content).decode()

        assert response.status_code == 200
        assert response['Content-Type'] == 'text/event-stream'
        assert response.streaming

        frames = parse_sse_frames(raw)
        types = [event_type for event_type, _payload in frames]

        assert types[0] == "meta"
        meta_chat_id = frames[0][1]["chat_id"]
        assert frames[0][1]["message_id"]
        assert "status" in types
        assert "token" in types
        assert types[-1] == "done"

        status_payloads = [payload for event_type, payload in frames if event_type == "status"]
        tool_ends = [p for p in status_payloads if p.get("type") == "tool_end"]
        assert tool_ends[0]["tool"] == "create_flashcard_deck"
        assert tool_ends[0]["deck_id"]

        # User message persisted immediately; assistant message saved after streaming.
        chat = Chat.objects.get(chat_id=meta_chat_id)
        roles = [m.role for m in chat.messages.all()]
        assert roles.count("user") == 1
        assert roles.count("assistant") == 1
        assert any(FINAL_TEXT in m.text for m in chat.messages.filter(role="assistant"))

    def test_over_limit_emits_error_frame_only(user, profile, load_fixture):
        chat = Chat.objects.create(user=user, profile=profile, title='capped')
        chat.input_tokens = 14285500
        chat.output_tokens = 3571500
        chat.save()

        with patch.object(chat_module, 'AiClientWrapper', FakeAiWrapper):
            response = auth_client(user).post(f'/api/chats/{chat.chat_id}/stream', {
                'message': 'hello',
            }, format='multipart')
            raw = b"".join(response.streaming_content).decode()

        frames = parse_sse_frames(raw)
        types = [event_type for event_type, _payload in frames]

        assert types == ["meta", "error"]
        assert frames[1][1]["code"] == "over_limit"

    def test_requires_auth():
        response = APIClient().post(url, {'message': 'hi'})
        assert response.status_code == 401


@pytest.mark.django_db
def describe_legacy_post_with_events():
    def test_returns_full_response_plus_deck_events(user, profile, load_fixture):
        with patch.object(chat_module, 'AiClientWrapper', FakeAiWrapper):
            response = auth_client(user).post('/api/chats/new', {
                'message': 'Make me a deck about mitosis',
                'profile': str(profile.profile_id),
            })

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["response"], str)
        assert data["chat_id"]

        deck_events = [e for e in data.get("events") or []
                       if e.get("type") == "flashcard_deck_created"]
        assert len(deck_events) == 1
        assert deck_events[0]["name"] == "Cell Bio"
        assert deck_events[0]["card_count"] == 1
        assert deck_events[0]["deck_id"]

        assistant = [m for m in Chat.objects.get(chat_id=data["chat_id"]).messages.all()
                     if m.role == "assistant"]
        assert FINAL_TEXT in assistant[-1].text
