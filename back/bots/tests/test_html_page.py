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

    def it_blocks_entity_encoded_bypasses():
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        tool = svc._create_html_page_tool()
        result = tool.invoke({
            "title": "x",
            "html": "<html><body>p&#111;rn movies</body></html>",
        })
        assert result == HTML_PAGE_BLOCKED
        assert HtmlPage.objects.count() == 0

    def it_rejects_external_resources():
        from bots.serializers.html_page_serializer import (
            has_external_resource,
            is_single_file_html,
        )
        assert has_external_resource(
            '<html><script src="https://example.test/app.js"></script></html>'
        ) is True
        assert has_external_resource('<html><img src="//cdn.test/x.png"></html>') is True
        assert has_external_resource('<html><a href="javascript:alert(1)">x</a></html>') is True
        assert has_external_resource('<html><img src="a.png 1x, https://e.test/b.png 2x"></html>') is True
        assert is_single_file_html(
            '<html><script src="https://example.test/app.js"></script></html>'
        ) is False
        # Inline JS, data: images and fragment links stay allowed.
        assert is_single_file_html(
            '<html><body><img src="data:image/png;base64,AAA">'
            '<a href="#top">up</a><script>console.log(1)</script></body></html>'
        ) is True
        chat = _chat()
        tool = ChatAgentService(chat, MagicMock())._create_html_page_tool()
        result = tool.invoke({
            "title": "Game",
            "html": '<html><script src="https://example.test/app.js"></script></html>',
        })
        assert "self-contained" in result
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

    def it_updates_pages_from_other_chats_of_the_same_profile():
        chat = _chat()
        other = Chat.objects.create(user=chat.user, profile=chat.profile, bot=chat.bot)
        svc = ChatAgentService(chat, MagicMock())
        svc._create_html_page_tool().invoke({
            "title": "Dino", "html": "<html><body>hi</body></html>",
        })
        page = HtmlPage.objects.get()
        other_svc = ChatAgentService(other, MagicMock())
        result = other_svc._create_html_page_update_tool().invoke({
            "page_id": str(page.page_id),
            "html": "<html><body>blue</body></html>",
        })
        assert "Updated page" in result
        page.refresh_from_db()
        assert "blue" in page.html

    def it_rejects_pages_from_other_profiles():
        from django.contrib.auth.models import User as AuthUser
        chat = _chat()
        svc = ChatAgentService(chat, MagicMock())
        svc._create_html_page_tool().invoke({
            "title": "Dino", "html": "<html><body>hi</body></html>",
        })
        page = HtmlPage.objects.get()
        stranger = AuthUser.objects.create(username="stranger")
        stranger_profile = Profile.objects.create(user=stranger, name="S")
        stranger_chat = Chat.objects.create(user=stranger, profile=stranger_profile, bot=chat.bot)
        stranger_svc = ChatAgentService(stranger_chat, MagicMock())
        assert "Unknown page" in stranger_svc._create_html_page_update_tool().invoke({
            "page_id": str(page.page_id),
            "html": "<html><body>hijack</body></html>",
        })
        page.refresh_from_db()
        assert "hijack" not in page.html

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
        assert "Dino" in catalog.content
        # A new chat for the same profile still sees the page (by title).
        new_chat = Chat.objects.create(user=chat.user, profile=chat.profile, bot=chat.bot)
        new_catalog = ChatAgentService(new_chat, MagicMock())._page_catalog_message()
        assert new_catalog is not None
        assert "Dino" in new_catalog.content


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
        assert "connect-src 'none'" in resp["Content-Security-Policy"]
        assert resp["X-Content-Type-Options"] == "nosniff"
        assert resp["Cache-Control"] == "no-store"

    def it_blocks_direct_writes_but_allows_delete():
        from rest_framework.test import APIClient
        user = User.objects.create(username="writeuser")
        profile = Profile.objects.create(user=user, name="Kid")
        page = HtmlPage.objects.create(
            profile=profile, title="T", html="<html><body>hi</body></html>",
        )
        client = APIClient()
        client.force_authenticate(user=user)
        assert client.post("/api/html-pages/", {"title": "X"}).status_code == 405
        assert client.put(f"/api/html-pages/{page.page_id}/", {}).status_code == 405
        assert client.patch(f"/api/html-pages/{page.page_id}/", {}).status_code == 405
        assert client.delete(f"/api/html-pages/{page.page_id}/").status_code == 204
        assert HtmlPage.objects.count() == 0

    def it_serves_signed_urls_without_session_auth():
        from rest_framework.test import APIClient
        user = User.objects.create(username="siguser")
        profile = Profile.objects.create(user=user, name="Kid")
        page = HtmlPage.objects.create(
            profile=profile, title="T", html="<html><body>hi</body></html>",
        )
        authed = APIClient()
        authed.force_authenticate(user=user)
        # Link endpoint returns an API-relative URL; the test client mounts
        # the API under /api/ (the app prepends its BASE_URL instead).
        link = "/api" + authed.get(f"/api/html-pages/{page.page_id}/link/").data["url"]
        anon = APIClient()
        assert anon.get(link).status_code == 200
        assert anon.get(f"/api/html-pages/{page.page_id}/raw/").status_code == 401
        # Tampered page id or signature fails closed.
        assert anon.get(link.replace(str(page.page_id)[-2:], "ff")).status_code in (401, 404)
        assert anon.get(f"/api/html-pages/{page.page_id}/raw/?sig=junk").status_code == 401
        # A signature issued for another page cannot open this one.
        other_page = HtmlPage.objects.create(
            profile=profile, title="Other", html="<html><body>other</body></html>",
        )
        other_link = "/api" + authed.get(
            f"/api/html-pages/{other_page.page_id}/link/"
        ).data["url"]
        other_sig = other_link.split("sig=")[1]
        assert anon.get(
            f"/api/html-pages/{page.page_id}/raw/?sig={other_sig}"
        ).status_code in (401, 404)

    def it_locks_teens_to_their_claimed_profile():
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        user = User.objects.create(username="teenparent")
        kid_a = Profile.objects.create(user=user, name="KidA")
        kid_b = Profile.objects.create(user=user, name="KidB")
        page_b = HtmlPage.objects.create(
            profile=kid_b, title="B", html="<html><body>b</body></html>",
        )
        refresh = RefreshToken.for_user(user)
        refresh["is_teen_delegated"] = True
        refresh["session_type"] = "teen"
        refresh["active_profile_id"] = str(kid_a.profile_id)
        teen = APIClient()
        teen.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        assert teen.get(f"/api/html-pages/{page_b.page_id}/raw/").status_code == 404
        assert teen.get("/api/html-pages/").data["results"] == []

    def it_serves_nothing_to_teens_with_an_invalid_claim():
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        user = User.objects.create(username="teenparent2")
        kid_a = Profile.objects.create(user=user, name="KidA")
        page_a = HtmlPage.objects.create(
            profile=kid_a, title="A", html="<html><body>a</body></html>",
        )
        refresh = RefreshToken.for_user(user)
        refresh["is_teen_delegated"] = True
        refresh["session_type"] = "teen"
        refresh["active_profile_id"] = "00000000-0000-0000-0000-000000000000"
        teen = APIClient()
        teen.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        # Claimed profile does not exist: the helper returns None, and the
        # raw view must fail closed instead of serving parent-owned pages.
        assert teen.get(f"/api/html-pages/{page_a.page_id}/raw/").status_code == 404
