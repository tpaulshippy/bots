from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User

from bots.models import Bot, Chat, HtmlPage, Profile
from bots.services.chat_agent import HTML_PAGE_BLOCKED, ChatAgentService


@pytest.mark.django_db
def describe_html_page_tool():
    def _chat():
        user = User.objects.create()
        profile = Profile.objects.create(user=user, name="Kid")
        bot = Bot.objects.create(user=user, name="Web", enable_html_pages=True)
        return Chat.objects.create(user=user, profile=profile, bot=bot)

    def it_saves_safe_page_with_js():
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        tool = svc._create_html_page_tool()
        result = tool.invoke({
            "title": "Dino",
            "html": "<html><body><h1>Hi</h1><script>console.log(1)</script></body></html>",
        })
        assert "Saved page" in result
        assert HtmlPage.objects.count() == 1
        assert svc.client_events[0]["tool"] == "save_html_page"

    def it_blocks_unsafe_page_text():
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        tool = svc._create_html_page_tool()
        result = tool.invoke({
            "title": "x",
            "html": "<html><body>porn xxx movies naked</body></html>",
        })
        assert result == HTML_PAGE_BLOCKED
        assert HtmlPage.objects.count() == 0

    def it_requires_flag_and_profile():
        chat = _chat()
        chat.bot.enable_html_pages = False
        chat.bot.save()
        assert ChatAgentService(chat, MagicMock())._create_html_page_tool() is None

    def it_updates_page_in_place_keeping_url():
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        save = svc._create_html_page_tool()
        save.invoke({"title": "Dino", "html": "<html><body><h1>v1</h1></body></html>"})
        page = HtmlPage.objects.get()
        update = svc._create_html_page_update_tool()
        result = update.invoke({
            "page_id": str(page.page_id),
            "html": "<html><body><h1>v2 blue</h1></body></html>",
        })
        assert "Updated page" in result
        page.refresh_from_db()
        assert "v2 blue" in page.html
        assert HtmlPage.objects.count() == 1
        assert svc.client_events[-1]["tool"] == "update_html_page"

    def it_rejects_unknown_or_foreign_page_ids():
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        update = svc._create_html_page_update_tool()
        assert "Unknown page" in update.invoke({
            "page_id": "00000000-0000-0000-0000-000000000000",
            "html": "<html><body>hi</body></html>",
        })

    def it_lists_chat_pages_for_iteration():
        from langchain_core.messages import SystemMessage
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        assert svc._page_catalog_message() is None
        svc._create_html_page_tool().invoke({
            "title": "Dino", "html": "<html><body>hi</body></html>",
        })
        catalog = ChatAgentService(chat, MagicMock())._page_catalog_message()
        assert isinstance(catalog, SystemMessage)
        assert "update_html_page" in catalog.content


@pytest.mark.django_db
def describe_html_page_raw_view():
    def it_serves_sandboxed_headers():
        from rest_framework.test import APIClient
        user = User.objects.create(username="rawuser")
        profile = Profile.objects.create(user=user, name="Kid")
        page = HtmlPage.objects.create(
            profile=profile, title="T",
            html="<html><body>hi<script>alert(1)</script></body></html>",
        )
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get(f"/api/html-pages/{page.page_id}/raw/")
        assert resp.status_code == 200
        assert "sandbox allow-scripts" in resp["Content-Security-Policy"]
        assert "allow-same-origin" not in resp["Content-Security-Policy"]
        assert resp["X-Content-Type-Options"] == "nosniff"
