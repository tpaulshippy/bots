#!/usr/bin/env python3
"""Drive the locally-seeded Syft Learning web build with Playwright.

The Expo web build reads AsyncStorage from window.localStorage with NO key
prefix (see @react-native-async-storage/async-storage src/AsyncStorage.ts), so
the same manifest the iOS capture script injects works here verbatim. That
gives us authed access to seeded screens without OAuth.
"""
import json
import os
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

# The Expo web export is served by Django itself (back/server/views.py:web_app,
# WEB_APP_ROOT = front/dist), so the only origin needed is the Django dev server.
# Build it first with the same command deploy.yml uses:
#   cd front && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api \
#     npx expo export --platform web --output-dir dist --clear --no-bytecode
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.environ.get("WEB_BASE", "http://127.0.0.1:8000/app")
API = "http://127.0.0.1:8000/api"
OUT = os.path.join(ROOT, "docs/marketing/1.0.6/screenshots-web")
os.makedirs(OUT, exist_ok=True)
VIEWPORT = {"width": 402, "height": 874}  # iPhone 16 Pro-ish, CSS px


def get_token():
    req = urllib.request.Request(
        f"{API}/token/",
        data=json.dumps({"username": "promo-demo", "password": "promo-pass-123"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req))


def api(path, access):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {access}"})
    return json.load(urllib.request.urlopen(req))


def rows(p):
    return p if isinstance(p, list) else p.get("results", [])


def main():
    tok = get_token()
    access, refresh = tok["access"], tok["refresh"]
    print("auth ok")

    profiles, bots, chats, decks = (
        api("/profiles.json", access),
        api("/bots.json", access),
        api("/chats.json", access),
        api("/decks.json", access),
    )
    # Science Bot carries a written system prompt, which is the parent-control
    # story, so the editor shot uses it rather than an arbitrary bot.
    bot_rows = rows(bots)
    control_bot = next((b for b in bot_rows if b.get("name") == "Science Bot"), bot_rows[0])
    control_bot_id = control_bot.get("bot_id") or control_bot.get("id")
    print(f"seeded: {len(rows(profiles))} profiles, {len(rows(bots))} bots, "
          f"{len(rows(chats))} chats, {len(rows(decks))} decks")

    bot = json.dumps(rows(bots)[0])
    profile = json.dumps(rows(profiles)[0])

    # pick the richest chat
    best, chat_id = -1, None
    for c in rows(chats):
        cid = c.get("chat_id") or c.get("id")
        try:
            msgs = api(f"/chats/{cid}/messages.json", access)
            n = len(rows(msgs))
            if n > best:
                best, chat_id = n, cid
                profile = json.dumps(c.get("profile") or rows(profiles)[0])
        except Exception as e:
            print("  chat probe failed", cid, e)
    deck = next((d for d in rows(decks) if d.get("name") == "Fractions"), rows(decks)[0])
    deck_id = deck.get("deck_id") or deck.get("id")
    print(f"richest chat={chat_id} ({best} msgs)  deck={deck_id} ({deck.get('name')})")

    manifest = {
        "tokens": json.dumps({API: {"access": access, "refresh": refresh}}),
        "selectedProfile": profile,
        "selectedBot": bot,
        "e2eTestMode": "true",
    }
    js = "".join(
        f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in manifest.items()
    )

    routes = [
        ("00-login", "/login", None),
        ("01-chat", f"/botChat?chatId={chat_id}", "bottom"),
        ("02-selectbot", "/selectBot", None),
        ("03-chatlist", "/chatHistory", None),
        ("04-flashcards", "/flashcards", None),
        ("05-deck", f"/flashcards/deck?deckId={deck_id}", None),
        ("06-study", f"/flashcards/study?deckId={deck_id}", None),
        ("07-stats", "/stats", None),
        ("08-materials", "/studyMaterials", None),
        ("09-activity", "/parent/activity", None),
        ("10-bot-editor", f"/parent/botEditor?botId={control_bot_id}", None),
        ("11-notifications", "/parent/notifications", None),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=3, is_mobile=True,
                                  has_touch=True, color_scheme="light")
        ctx.add_init_script(js)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))

        failed = []
        for name, route, scroll in routes:
            url = f"{WEB}{route}"
            status = None
            try:
                resp = page.goto(url, wait_until="networkidle", timeout=45000)
                status = resp.status if resp else None
            except Exception as e:
                print(f"  {name}: nav warn {str(e)[:70]}")
            page.wait_for_timeout(3500)
            if scroll == "bottom":
                page.evaluate(
                    "() => { const els=[...document.querySelectorAll('*')]"
                    ".filter(e=>e.scrollHeight>e.clientHeight+80);"
                    "for (const e of els) { e.scrollTop = e.scrollHeight } }"
                )
                page.wait_for_timeout(1200)
            # A failed nav or a non-2xx response still leaves something on screen
            # -- a 404 page, or the previous route still rendered -- and that
            # would be saved as a marketing asset. Every PNG in this directory
            # gets composited into published cards, so refuse rather than
            # silently shipping an error page.
            if status is not None and not (200 <= status < 300):
                print(f"  {name}: SKIPPED, HTTP {status} for {route}")
                failed.append((name, status))
                continue
            page.screenshot(path=f"{OUT}/{name}.png")
            print(f"  saved {name}  <- {route}")

        if failed:
            sys.exit(f"{len(failed)} screenshot(s) failed and were not written: "
                     + ", ".join(f"{n} (HTTP {s})" for n, s in failed))

        browser.close()
        if errors:
            print("\nCONSOLE ERRORS:")
            for e in dict.fromkeys(errors):
                print("  ", e[:160])


if __name__ == "__main__":
    main()
