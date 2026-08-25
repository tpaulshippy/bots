"""Deterministic fake LangChain/Bedrock client for the roadmap-06 demo path.

The e2e suite and manual demos need a chat that streams tokens progressively
and exercises a flashcard tool call WITHOUT real AWS credentials. Seeding a bot
whose AiModel.model_id starts with ``e2e-fake-stream`` makes ``AiClientWrapper``
wire up this client instead of ChatBedrock.

Script per conversation turn (deterministic):
  1st model call: emits a create_flashcard_deck tool call ("Cell Bio", 3 cards)
  later calls:    streams the final answer one word at a time with a small
                  pause between chunks so clients render progressive text.

Token pacing (TOKEN_PAUSE_SECONDS) keeps intermediate partial text observable
long enough for Detox assertions; totals are ~3s of streaming.
"""
import time

from langchain_core.messages import AIMessage, AIMessageChunk

FAKE_MODEL_PREFIX = "e2e-fake-stream"

DECK_NAME = "Cell Bio"
DECK_CARDS = [
    {"front": "What is mitosis?", "back": "The process where one cell splits into two identical cells."},
    {"front": "Name the first stage of mitosis.", "back": "Prophase"},
    {"front": "During which stage do chromosomes line up in the middle?", "back": "Metaphase"},
]
FINAL_ANSWER = (
    "Mitosis has four main stages. First **prophase**, when chromosomes "
    "condense. Then metaphase, anaphase, and finally telophase."
)

TOKEN_PAUSE_SECONDS = 0.12

USAGE_METADATA = {"input_tokens": 42, "output_tokens": 128, "total_tokens": 170}


def _word_chunks(text):
    words = text.split(" ")
    return [f"{word} " for word in words]


class _FakeBoundClient:
    """Mimics langchain's bind_tools(...) runnable using a shared call counter."""

    def __init__(self, call_count):
        self._call_count = call_count

    def _script_chunks(self):
        if self._call_count[0] == 1:
            # First iteration: a couple of empty heartbeats then a complete
            # tool call, so client buffering of tool_call chunks is exercised.
            return [
                AIMessageChunk(content=""),
                AIMessageChunk(content=""),
                AIMessageChunk(
                    content="",
                    tool_calls=[{
                        "name": "create_flashcard_deck",
                        "args": {
                            "name": DECK_NAME,
                            "flashcards": DECK_CARDS,
                            "description": "Mitosis study deck",
                        },
                        "id": "fake_call_create_flashcard_deck",
                        "type": "tool_call",
                    }],
                ),
            ]

        chunks = [
            AIMessageChunk(content=word)
            for word in _word_chunks(FINAL_ANSWER)
        ]
        # Usage arrives on the final chunk like most providers do.
        chunks[-1] = AIMessageChunk(content=chunks[-1].content, usage_metadata=USAGE_METADATA)
        return chunks

    def stream(self, message_list):
        self._call_count[0] += 1
        for chunk in self._script_chunks():
            time.sleep(TOKEN_PAUSE_SECONDS)
            yield chunk

    def invoke(self, message_list):
        merged = None
        for chunk in self.stream(message_list):
            merged = chunk if merged is None else merged + chunk
        if merged is None:
            return AIMessage(content="")
        return AIMessage(
            content=merged.content,
            tool_calls=getattr(merged, "tool_calls", None) or [],
        )


class FakeStreamingClient:
    def __init__(self):
        # Shared across bind_tools calls so successive agent iterations walk
        # the script in order.
        self._call_count = [0]

    def bind_tools(self, tools):
        return _FakeBoundClient(self._call_count)
