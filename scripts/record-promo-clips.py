#!/usr/bin/env python3
"""
Record real screen footage of the seeded app with Playwright.

The stills-based video was a slideshow; this drives the actual UI so the promo
has real motion: drawer navigation, a flashcard being flipped, the chat
transcript scrolling. Each scene is recorded as its own short clip so the
compositor can place them independently.

Prerequisites (see docs/marketing/1.0.6/README.md):
  1. Backend seeded with `manage.py seed_promo_demo` and running on :8000
  2. Web export built to front/dist so Django's web_app view can serve it
"""
import json
import os
import shutil
import time
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000/api"
WEB = os.environ.get("WEB_BASE", "http://127.0.0.1:8000/app")
OUT = os.environ.get("CLIP_OUT", "/tmp/opencode/clips")
VP = {"width": 402, "height": 874}

# name -> (route, settle_ms, [actions])
#   action "scroll:up/down"  scroll the nearest scrollable ancestor
#   action "click:SELECTOR"  best-effort click
#   action "wait:MS"         pause
SCENES = [
    ("chat", f"/botChat?chatId={{CHAT}}", 4500, [
        ("wait", 900),
        ("scroll_top", 0),
        ("scroll", -260), ("wait", 650),
        ("scroll", -260), ("wait", 650),
        ("scroll", -260), ("wait", 650),
        ("scroll_bottom", 0),
    ]),
    ("study", "/flashcards/study?deckId={DECK}", 4000, [
        ("wait", 700),
        ("click", "text=What is 2/4 simplified?"),
        ("wait", 1500),
    ]),
    ("flashcards", "/flashcards", 3500, [("wait", 900)]),
    ("stats", "/stats", 3500, [("wait", 1100)]),
    ("activity", "/parent/activity", 4000, [
        ("wait", 800),
        ("scroll", -220), ("wait", 600),
        ("scroll", -220), ("wait", 600),
    ]),
    ("bots", "/selectBot", 3500, [("wait", 1200)]),
    ("drawer", "/chat", 4000, [
        ("wait", 800),
        ("click", "text=Menu"),
        ("wait", 1400),
    ]),
]


def api(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    return json.load(urllib.request.urlopen(req))


def rows(p):
    return p if isinstance(p, list) else p.get("results", [])


def manifest_js(token):
    r = urllib.request.Request(
        f"{API}/token/",
        data=json.dumps({"username": "promo-demo", "password": "promo-pass-123"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    t = json.load(urllib.request.urlopen(r))
    profiles, bots, chats, decks = (
        api("/profiles.json", t["access"]), api("/bots.json", t["access"]),
        api("/chats.json", t["access"]), api("/decks.json", t["access"]),
    )
    # richest chat so the transcript is worth scrolling
    best, cid = -1, None
    for c in rows(chats):
        i = c.get("chat_id") or c.get("id")
        try:
            n = len(rows(api(f"/chats/{i}/messages.json", t["access"])))
            if n > best:
                best, cid = n, i
                prof = c.get("profile")
        except Exception:
            pass
    deck = next((d for d in rows(decks) if d.get("name") == "Fractions"), rows(decks)[0])
    m = {
        "tokens": json.dumps({API: {"access": t["access"], "refresh": t["refresh"]}}),
        "selectedProfile": json.dumps(prof or rows(profiles)[0]),
        "selectedBot": json.dumps(rows(bots)[0]),
        "e2eTestMode": "true",
    }
    js = "".join(f"localStorage.setItem({json.dumps(k)},{json.dumps(v)});" for k, v in m.items())
    return js, cid, (deck.get("deck_id") or deck.get("id"))


SCROLL_JS = """() => {
  const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+80);
  if(!els.length) return 0;
  let best=null, max=0;
  for(const e of els){const d=e.scrollHeight-e.clientHeight; if(d>max){max=d;best=e;}}
  window.__scroller = best; return max;
}"""


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    js, chat_id, deck_id = manifest_js(None)
    print(f"chat={chat_id} deck={deck_id}")

    made = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        for name, route, settle, actions in SCENES:
            url = WEB + route.replace("{CHAT}", str(chat_id)).replace("{DECK}", str(deck_id))
            ctx = browser.new_context(
                viewport=VP, device_scale_factor=2, is_mobile=True, has_touch=True,
                color_scheme="light", record_video_dir=OUT, record_video_size=VP,
            )
            ctx.add_init_script(js)
            page = ctx.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as e:
                print(f"  {name}: nav warn {str(e)[:60]}")
            page.wait_for_timeout(settle)
            for act in actions:
                kind, arg = act
                try:
                    if kind == "wait":
                        page.wait_for_timeout(arg)
                    elif kind == "click":
                        page.click(arg, timeout=4000)
                    elif kind == "scroll":
                        page.evaluate(SCROLL_JS)
                        page.evaluate("d => { if(window.__scroller) window.__scroller.scrollTop += d }", arg)
                    elif kind == "scroll_top":
                        page.evaluate(SCROLL_JS)
                        page.evaluate("() => { if(window.__scroller) window.__scroller.scrollTop = 0 }")
                    elif kind == "scroll_bottom":
                        page.evaluate(SCROLL_JS)
                        page.evaluate(
                            "() => { if(window.__scroller) window.__scroller.scrollTop = window.__scroller.scrollHeight }"
                        )
                except Exception as e:
                    print(f"    {name}: action {kind} failed ({str(e)[:50]})")
            page.wait_for_timeout(400)
            ctx.close()  # flushes the video
            made.append(name)
            print(f"  recorded {name}")

        browser.close()

    # Playwright names files <random>.webm; rename to the scene name.
    vids = sorted(
        (f for f in os.listdir(OUT) if f.endswith(".webm")),
        key=lambda f: os.path.getmtime(os.path.join(OUT, f)),
    )
    for name, src in zip(made, vids):
        dst = os.path.join(OUT, f"{name}.webm")
        if os.path.abspath(src) != os.path.abspath(dst):
            shutil.move(os.path.join(OUT, src), dst)
    for f in sorted(os.listdir(OUT)):
        print("  ", f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
