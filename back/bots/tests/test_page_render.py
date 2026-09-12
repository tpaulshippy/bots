"""Phase-1 render check: screenshot tool with mocked Playwright."""
import sys
import types
from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User

from bots.models import AiModel, Bot, Chat, HtmlPage, Profile
from bots.services import page_render
from bots.services.chat_agent import ChatAgentService


def _vision_chat():
    user = User.objects.create()
    profile = Profile.objects.create(user=user, name="Kid")
    model = AiModel.objects.create(
        model_id="test-vision-1",
        name="Vision",
        is_default=True,
        supported_input_modalities=["text", "image"],
    )
    bot = Bot.objects.create(user=user, name="Web", ai_model=model, enable_html_pages=True)
    return Chat.objects.create(user=user, profile=profile, bot=bot)


def _install_fake_playwright(monkeypatch, png=b"fakepng", console=None, page_err=None, rendered="Dino fun page"):
    """Fake sync_playwright: set_content records HTML, blocks nothing real."""
    state = {}

    class FakePage:
        def __init__(self):
            self.handlers = {}
            self.html = ""

        def on(self, event, handler):
            self.handlers[event] = handler

        def set_content(self, html, wait_until="load", timeout=10000):
            self.html = html
            state["html"] = html
            for text in (console or []):
                self.handlers["console"](MagicMock(type="error", text=text))

        def wait_for_timeout(self, ms):
            pass

        def inner_text(self, selector):
            return rendered

        def screenshot(self):
            return png

    class FakeContext:
        def route(self, pattern, handler):
            state["route_pattern"] = pattern

        def new_page(self):
            return FakePage()

        def close(self):
            pass

    class FakeBrowser:
        def new_context(self, viewport=None):
            state["viewport"] = viewport
            return FakeContext()

        def close(self):
            pass

    class FakePW:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        @property
        def chromium(self):
            return self

        def launch(self):
            return FakeBrowser()

    module = types.ModuleType("playwright.sync_api")
    module.sync_playwright = lambda: FakePW()
    parent = types.ModuleType("playwright")
    parent.sync_api = module
    monkeypatch.setitem(sys.modules, "playwright", parent)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", module)
    return state


@pytest.mark.django_db
def describe_render_available():
    def it_is_false_without_playwright(monkeypatch):
        monkeypatch.delitem(sys.modules, "playwright.sync_api", raising=False)
        monkeypatch.delitem(sys.modules, "playwright", raising=False)
        monkeypatch.setattr(page_render.settings, "PAGE_RENDER_ENABLED", True, raising=False)
        import builtins
        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name.startswith("playwright"):
                raise ImportError("nope")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", fake_import)
        assert page_render.render_available() is False

    def it_renders_and_blocks_network(monkeypatch):
        state = _install_fake_playwright(monkeypatch)
        shot = page_render.render_page_shot("<html><body>hi</body></html>")
        assert shot["png_bytes"] == b"fakepng"
        assert state["html"] == "<html><body>hi</body></html>"
        assert state["route_pattern"] == "**/*"
        assert state["viewport"] == {"width": 1280, "height": 800}


@pytest.mark.django_db
def describe_preview_tool():
    def it_binds_with_flag_vision_and_renderer(monkeypatch):
        _install_fake_playwright(monkeypatch)
        svc = ChatAgentService(_vision_chat(), MagicMock())
        assert svc._create_preview_page_tool() is not None

    def it_returns_none_without_flag(monkeypatch):
        _install_fake_playwright(monkeypatch)
        chat = _vision_chat()
        chat.bot.enable_html_pages = False
        chat.bot.save()
        assert ChatAgentService(chat, MagicMock())._create_preview_page_tool() is None

    def it_returns_none_for_text_only_model(monkeypatch):
        _install_fake_playwright(monkeypatch)
        user = User.objects.create()
        profile = Profile.objects.create(user=user, name="Kid")
        model = AiModel.objects.create(
            model_id="test-text-1", name="Text", supported_input_modalities=["text"],
        )
        bot = Bot.objects.create(user=user, name="Web", ai_model=model, enable_html_pages=True)
        chat = Chat.objects.create(user=user, profile=profile, bot=bot)
        assert ChatAgentService(chat, MagicMock())._create_preview_page_tool() is None

    def it_screenshots_and_queues_image_observation(monkeypatch):
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

        _install_fake_playwright(monkeypatch, console=["boom"])
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        tool = svc._create_preview_page_tool()
        page_id = svc._create_html_page_tool().invoke({
            "title": "Dino", "html": "<html><body>hi<script>x</script></body></html>",
        }).split("/api/html-pages/")[1].split("/raw")[0]

        result = tool.invoke({"page_id": page_id})
        assert "Rendered 'Dino'" in result
        assert "boom" in result
        assert len(svc._pending_observations) == 1

        # Full loop: ToolMessage followed by image HumanMessage.
        bound = MagicMock()
        first = AIMessage(
            content="",
            tool_calls=[{"name": "preview_page", "args": {"page_id": page_id}, "id": "c1", "type": "tool_call"}],
        )
        final = AIMessage(content="looks good")
        bound.invoke.side_effect = [first, final]
        tools = {"preview_page": tool}
        messages = svc._run_agent_loop(bound, [], tools)
        kinds = [type(m).__name__ for m in messages]
        assert "ToolMessage" in kinds and "HumanMessage" in kinds
        human = next(m for m in messages if isinstance(m, HumanMessage))
        assert human.content[1]["image_url"]["url"].startswith("data:image/png;base64,")
        assert any(isinstance(m, ToolMessage) for m in messages)

    def it_caps_previews_per_turn(monkeypatch):
        _install_fake_playwright(monkeypatch)
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        tool = svc._create_preview_page_tool()
        page = HtmlPage.objects.create(
            profile=chat.profile, chat=chat, bot=chat.bot,
            title="T", html="<html><body>hi</body></html>",
        )
        svc._preview_count = 2
        assert "already checked" in tool.invoke({"page_id": str(page.page_id)})

    def it_rejects_foreign_page(monkeypatch):
        _install_fake_playwright(monkeypatch)
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        assert "Unknown page" in svc._create_preview_page_tool().invoke({
            "page_id": "00000000-0000-0000-0000-000000000000",
        })

    def it_keeps_tool_messages_contiguous_when_preview_is_not_last(monkeypatch):
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
        _install_fake_playwright(monkeypatch)
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        save = svc._create_html_page_tool()
        preview = svc._create_preview_page_tool()
        page_id = save.invoke({
            "title": "Dino", "html": "<html><body>hi</body></html>",
        }).split("/api/html-pages/")[1].split("/raw")[0]
        first = AIMessage(
            content="",
            tool_calls=[
                {"name": "preview_page", "args": {"page_id": page_id}, "id": "c1", "type": "tool_call"},
                {"name": "save_html_page", "args": {"title": "Second", "html": "<html><body>two</body></html>"}, "id": "c2", "type": "tool_call"},
            ],
        )
        bound = MagicMock()
        bound.invoke.side_effect = [first, AIMessage(content="done")]
        messages = svc._run_agent_loop(
            bound, [], {"preview_page": preview, "save_html_page": save}
        )
        tool_idx = [i for i, m in enumerate(messages) if isinstance(m, ToolMessage)]
        human_idx = [i for i, m in enumerate(messages) if isinstance(m, HumanMessage)]
        assert tool_idx == [1, 2]
        assert human_idx == [3]
        assert isinstance(messages[3].content[1]["image_url"], dict)

    def it_records_no_event_when_no_screenshot_captured(monkeypatch):
        _install_fake_playwright(monkeypatch, png=None)
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        page_id = svc._create_html_page_tool().invoke({
            "title": "Dino", "html": "<html><body>hi</body></html>",
        }).split("/api/html-pages/")[1].split("/raw")[0]
        events_before = len(svc.client_events)
        result = svc._create_preview_page_tool().invoke({"page_id": page_id})
        assert "No screenshot captured" in result
        assert len(svc.client_events) == events_before
        assert svc._pending_observations == []

    def it_blocks_runtime_generated_unsafe_text(monkeypatch):
        # Static source has no blocked term; the JS writes it at runtime.
        _install_fake_playwright(
            monkeypatch, rendered="click for porn xxx movies here"
        )
        chat = _vision_chat()
        svc = ChatAgentService(chat, MagicMock())
        page_id = svc._create_html_page_tool().invoke({
            "title": "Game",
            "html": "<html><body><script>document.write('clean')</script></body></html>",
        }).split("/api/html-pages/")[1].split("/raw")[0]
        from bots.models import SafetyEvent
        events_before = len(svc.client_events)
        result = svc._create_preview_page_tool().invoke({"page_id": page_id})
        assert "didn't pass the safety check" in result
        assert len(svc.client_events) == events_before
        assert svc._pending_observations == []
        assert SafetyEvent.objects.filter(stage="tool_html_page").exists()
