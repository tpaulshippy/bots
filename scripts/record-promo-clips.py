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
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8000/api"
WEB = os.environ.get("WEB_BASE", "http://127.0.0.1:8000/app")
OUT = os.environ.get("CLIP_OUT", "/tmp/opencode/clips")
VP = {"width": 402, "height": 874}

# Each scene performs the real interaction, not just a page load. The promo has
# to show the features working: a flashcard flips and gets rated, a study page
# opens, a transcript opens, the notification switches flip, and the system prompt
# gets typed into. Selectors come from the app's own testIDs.
#
#   wait:MS              pause
#   sel:CSS              click a CSS selector (testIDs are the stable handle)
#   nthsel:CSS:N         click the Nth match
#   type:CSS|TEXT        focus a field and type, slowly enough to read. Focus
#                        rather than click: the editor sits inside a
#                        KeyboardAvoidingView + ScrollView, so click() fails
#                        Playwright's actionability check even though the field
#                        is plainly on screen.
#   scroll_top / scroll:D / scroll_bottom
SCENES = [
    # 1 educational: flip the card, then rate it and see the next one come up
    ("study", "/flashcards/study?deckId={DECK}", 4000, [
        ("wait", 800),
        ("sel", "[data-testid='study-card']"),
        ("wait", 1500),
        ("sel", "[data-testid='study-rating-good']"),
        ("wait", 2600),
    ]),
    # 1 educational: open a study page the tutor built
    ("materials", "/studyMaterials", 4000, [
        ("wait", 1600),
        ("goto_page", None),
        ("wait", 3000),
    ]),
    # 2 parent control: open a transcript and read it
    ("activity", "/parent/activity", 4000, [
        ("wait", 1000),
        ("sel", "[data-testid='activity-chat-row-0']"),
        ("wait", 3200),
    ]),
    # 2 parent control: flip the notification switches
    ("notifications", "/parent/notifications", 4000, [
        ("wait", 900),
        ("sel", "[data-testid='notify-new-chat-switch']"),
        ("wait", 1400),
        ("sel", "[data-testid='notify-digest-only-switch']"),
        ("wait", 1800),
    ]),
    # 2 parent control: type a system prompt
    ("boteditor", "/parent/botEditor?botId={BOT}", 5000, [
        ("wait", 1200),
        ("sel", "textarea"),
        ("type", "textarea| Always ask them to explain it back in their own words first."),
        ("wait", 2800),
    ]),
]


def api(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    return json.load(urllib.request.urlopen(req))


def rows(p):
    return p if isinstance(p, list) else p.get("results", [])


def manifest_js(token=None):
    """Auth manifest for localStorage, plus the ids the routes need."""
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
    # Science Bot carries a distinctive written system prompt, so the parent
    # control story has something real on screen to edit.
    bots_list = rows(bots)
    bot = next((b for b in bots_list if b.get("name") == "Science Bot"), bots_list[0])
    best, cid, prof = -1, None, None
    for c in rows(chats):
        i = c.get("chat_id") or c.get("id")
        try:
            n = len(rows(api(f"/chats/{i}/messages.json", t["access"])))
            if n > best:
                best, cid, prof = n, i, c.get("profile")
        except Exception:
            pass
    deck = next((d for d in rows(decks) if d.get("name") == "Fractions"), rows(decks)[0])
    # On web, pressing a Study Materials row does not open the in-app viewer
    # (WebView is native-only) - it window.opens a signed raw URL in a new tab,
    # which a context recording does not capture. So resolve that same signed URL
    # up front and navigate to it directly: it is literally the page the student
    # reads, so the scene shows the real thing rather than a stand-in.
    page_url = ""
    try:
        pages = rows(api("/html-pages.json", t["access"]))
        pick = next((x for x in pages if x.get("title") == "Fractions Practice Lab"),
                    pages[0] if pages else None)
        if pick:
            page_url = API + api(f"/html-pages/{pick['page_id']}/link/", t["access"])["url"]
    except Exception as e:
        print(f"  could not resolve a study page: {e}")
    m = {
        "tokens": json.dumps({API: {"access": t["access"], "refresh": t["refresh"]}}),
        "selectedProfile": json.dumps(prof or rows(profiles)[0]),
        "selectedBot": json.dumps(bot),
        "e2eTestMode": "true",
    }
    js = "".join(f"localStorage.setItem({json.dumps(k)},{json.dumps(v)});" for k, v in m.items())
    return (js, cid, (deck.get("deck_id") or deck.get("id")),
            (bot.get("bot_id") or bot.get("id")), page_url)


# Action kinds whose effect is visible on screen, and so must be fully inside
# an edit window. "wait" is not one: it only pads.
VISIBLE_ACTIONS = {"sel", "nthsel", "type", "goto_page"}

SCROLL_JS = """() => {
  const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+80);
  if(!els.length) return 0;
  let best=null, max=0;
  for(const e of els){const d=e.scrollHeight-e.clientHeight; if(d>max){max=d;best=e;}}
  window.__scroller = best; return max;
}"""


def seed():
    """Reset the demo data.

    Rating a flashcard during capture mutates the review queue, so a second run
    against the same database starts from a different card and the clip timings
    are wrong. The seed command is idempotent, so re-running it here makes the
    recordings reproducible instead of a one-shot that quietly degrades.
    """
    back = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "back")
    subprocess.run([sys.executable, "manage.py", "seed_promo_demo"],
                   cwd=back, check=True, capture_output=True)
    print("  re-seeded promo-demo data")


def main():
    if os.environ.get("NO_SEED", "") != "1":
        seed()
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    js, chat_id, deck_id, bot_id, page_url = manifest_js()
    print(f"chat={chat_id} deck={deck_id} bot={bot_id} page={'yes' if page_url else 'no'}")

    made = []
    timings = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb"])
        for name, route, settle, actions in SCENES:
            url = (WEB + route.replace("{CHAT}", str(chat_id))
                   .replace("{DECK}", str(deck_id)).replace("{BOT}", str(bot_id)))
            assert "{" not in url, f"unsubstituted placeholder in {url}"
            # One directory per scene: Playwright names videos per page, and a
            # click that navigates or opens a tab can emit more than one, which
            # broke the old rename-by-mtime pairing.
            sdir = os.path.join(OUT, name)
            os.makedirs(sdir, exist_ok=True)
            t0 = time.monotonic()
            ctx = browser.new_context(
                viewport=VP, device_scale_factor=2, is_mobile=True, has_touch=True,
                color_scheme="light", record_video_dir=sdir, record_video_size=VP,
            )
            ctx.add_init_script(js)
            page = ctx.new_page()
            # Playwright starts the video when the context's first page is
            # created, so this is the clip's t=0. Action times are recorded
            # against it because the edit windows in make-promo-video.py are
            # measured off this footage, and load time varies enough between
            # runs to move the interactions by a second or more.
            act_log = []
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as e:
                print(f"  {name}: nav warn {str(e)[:60]}")
            page.wait_for_timeout(settle)
            for act in actions:
                kind, arg = act
                a0 = time.monotonic()
                ok = False
                try:
                    if kind == "wait":
                        page.wait_for_timeout(arg)
                    elif kind == "sel":
                        # Wait for the element rather than trusting a fixed
                        # sleep: every scene gets a fresh context with a cold
                        # bundle, so a screen can still be hydrating when the
                        # settle time is up and the selector does not exist yet.
                        loc = page.locator(arg).first
                        loc.wait_for(state="attached", timeout=20000)
                        loc.click(timeout=8000)
                    elif kind == "nthsel":
                        sel, n = arg.rsplit(":", 1)
                        page.locator(sel).nth(int(n)).click(timeout=5000)
                    elif kind == "type":
                        target, text = arg.split("|", 1)
                        loc = page.locator(target).first
                        loc.wait_for(state="attached", timeout=20000)
                        # focus(), not click(): the editor sits inside a
                        # KeyboardAvoidingView + ScrollView, so click() can fail
                        # Playwright's actionability check even though the field
                        # is plainly on screen, and a raised click would skip the
                        # typing entirely and leave the clip showing nothing.
                        loc.focus(timeout=8000)
                        page.keyboard.type(text, delay=45)
                    elif kind == "goto_page":
                        if not page_url:
                            raise RuntimeError("no study page URL resolved")
                        page.goto(page_url, wait_until="networkidle", timeout=45000)
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
                    print(f"    {name}: action {kind}={str(arg)[:40]} failed")
                    print(f"      url  = {page.url}")
                    print(f"      body = {page.inner_text('body')[:100]!r}")
                    print(f"      err  = {str(e).splitlines()[0][:90]}")
                if kind in VISIBLE_ACTIONS:
                    act_log.append([round(a0 - t0, 3), round(time.monotonic() - t0, 3)])
            page.wait_for_timeout(400)
            ctx.close()  # flushes the video
            timings[name] = {"actions": act_log}
            made.append(name)
            print(f"  recorded {name}"
                  + (f"  actions {act_log[0][0]:.1f}-{act_log[-1][1]:.1f}s" if act_log else ""))

        browser.close()

    # Flatten: one clip per scene, taken from that scene's own directory.
    for name in made:
        sdir = os.path.join(OUT, name)
        vids = [f for f in os.listdir(sdir) if f.endswith(".webm")]
        if not vids:
            print(f"  {name}: NO VIDEO")
            continue
        # Largest is the real page; a stray popup page records a near-empty clip.
        src = max(vids, key=lambda f: os.path.getsize(os.path.join(sdir, f)))
        dst = os.path.join(OUT, f"{name}.webm")
        shutil.move(os.path.join(sdir, src), dst)
        shutil.rmtree(sdir, ignore_errors=True)
        d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nw=1:nk=1", dst], capture_output=True, text=True)
        if name in timings:
            timings[name]["duration"] = round(float(d.stdout.strip()), 3)

    # make-promo-video.py reads this to check its edit windows do not cut an
    # interaction off partway through.
    with open(os.path.join(OUT, "actions.json"), "w") as f:
        json.dump(timings, f, indent=1)
    for name in made:
        t = timings.get(name, {})
        acts = t.get("actions") or []
        if acts:
            print(f"  {name}: actions {acts[0][0]:.1f}-{acts[-1][1]:.1f}s"
                  f"  clip {t.get('duration', 0):.1f}s")
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        if os.path.isfile(p):
            print("  ", f, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
