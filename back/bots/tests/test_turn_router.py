"""Tests for the pre-agent turn router (System One / Jev heuristic v1)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from langchain_core.messages import HumanMessage, SystemMessage

from bots.services.turn_router import TurnRoute, query_jev, route_turn


def _bot(web=False, html=False):
    return SimpleNamespace(name="TestBot", enable_web_search=web, enable_html_pages=html)


def describe_route_turn():
    def returns_typed_fields():
        route = route_turn("What is 2+2?", _bot(web=True, html=True))
        assert isinstance(route, TurnRoute)
        assert isinstance(route.needs_web_search, bool)
        assert isinstance(route.needs_flashcard, bool)
        assert isinstance(route.needs_html_page, bool)
        assert isinstance(route.off_task, bool)
        assert isinstance(route.frustrated, bool)
        assert isinstance(route.subject, str)
        assert isinstance(route.confidences, dict)

    def confidences_in_unit_interval():
        texts = [
            "Who won the game today? Search the web for the latest score!",
            "Make me flashcards to quiz me on mitosis",
            "Build me a webpage game about dinosaurs",
            "tell me a joke, I'm bored",
            "ugh this is stupid, you're bad at explaining!!!",
            "What is 2+2?",
        ]
        for text in texts:
            route = route_turn(text, _bot(web=True, html=True))
            for key, value in route.confidences.items():
                assert 0.0 <= value <= 1.0, (text, key, value)

    def detects_search_flashcard_html_subjects():
        search = route_turn("Who won the game today? What is the latest news?", _bot(web=True))
        assert search.needs_web_search is True

        cards = route_turn("Make me flashcards to quiz me on mitosis", _bot())
        assert cards.needs_flashcard is True
        assert cards.subject == "science"

        page = route_turn("Build me a webpage game about dinosaurs", _bot(html=True))
        assert page.needs_html_page is True

    def detects_off_task_and_frustrated():
        off = route_turn("tell me a joke, I'm bored", _bot())
        assert off.off_task is True
        frust = route_turn("ugh this is stupid, you're bad at explaining!!!", _bot())
        assert frust.frustrated is True

    def bot_flags_gate_web_and_html():
        # Strong signal but flag off -> not bound.
        no_flag = route_turn("Who won today? Search the web for the latest score!", _bot(web=False))
        assert no_flag.needs_web_search is False
        assert no_flag.confidences["needs_web_search"] == 0.0

        no_html = route_turn("Build me a webpage game please", _bot(html=False))
        assert no_html.needs_html_page is False

    def query_jev_never_calls_network_by_default():
        # Heuristic mode returns {} without touching the network.
        with patch("urllib.request.urlopen") as urlopen:
            assert query_jev({"text": "hi"}, ["needs_web_search"]) == {}
            urlopen.assert_not_called()


def describe_chat_agent_wiring():
    def _service(bot):
        from bots.services.chat_agent import ChatAgentService

        chat = MagicMock()
        chat.bot = bot
        chat.profile = None
        svc = ChatAgentService.__new__(ChatAgentService)
        svc.chat = chat
        svc.ai_client = MagicMock()
        svc.client_events = []
        svc._pending_observations = []
        svc._preview_count = 0
        return svc

    def _fake_client(seen):
        class FakeClient:
            model_id = "test"

            def bind_tools(self, tools):
                seen["tools"] = [getattr(t, "name", "") for t in tools]

                class Inv:
                    def invoke(self, messages):
                        from langchain_core.messages import AIMessage

                        return AIMessage(content="done")

                return Inv()

        return FakeClient()

    def skips_web_search_tool_when_route_says_no_search(monkeypatch):
        import bots.services.turn_router as tr

        svc = _service(_bot(web=True, html=False))
        monkeypatch.setattr(tr, "router_enabled", lambda: True)
        no_search = TurnRoute(needs_web_search=False, confidences={"needs_web_search": 0.05})
        monkeypatch.setattr(tr, "route_turn", lambda *a, **k: no_search)
        seen = {}
        with patch("bots.services.chat_agent.settings.TAVILY_API_KEY", "test-key", create=True):
            svc.ai_client = _fake_client(seen)
            text, _ = svc.respond([SystemMessage(content="sys"), HumanMessage(content="What is 2+2?")])
        assert text == "done"
        assert "web_search" not in seen["tools"]

    def keeps_web_search_tool_when_route_says_yes_search(monkeypatch):
        import bots.services.turn_router as tr

        svc = _service(_bot(web=True, html=False))
        monkeypatch.setattr(tr, "router_enabled", lambda: True)
        yes_search = TurnRoute(needs_web_search=True, confidences={"needs_web_search": 0.85})
        monkeypatch.setattr(tr, "route_turn", lambda *a, **k: yes_search)
        seen = {}
        with patch("bots.services.chat_agent.settings.TAVILY_API_KEY", "test-key", create=True):
            svc.ai_client = _fake_client(seen)
            text, _ = svc.respond([SystemMessage(content="sys"), HumanMessage(content="Who won today?")])
        assert text == "done"
        assert "web_search" in seen["tools"]

    def router_disabled_keeps_legacy_behavior(monkeypatch):
        import bots.services.turn_router as tr

        svc = _service(_bot(web=True, html=False))
        monkeypatch.setattr(tr, "router_enabled", lambda: False)
        seen = {}
        with patch("bots.services.chat_agent.settings.TAVILY_API_KEY", "test-key", create=True):
            svc.ai_client = _fake_client(seen)
            svc.respond([SystemMessage(content="sys"), HumanMessage(content="What is 2+2?")])
        # Legacy path binds web_search whenever the bot flag + key allow it.
        assert "web_search" in seen["tools"]
