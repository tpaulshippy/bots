"""Server-side render check for agent-built HTML pages (phase 1: screenshot only).

Renders the stored DB HTML string in headless Chromium via Playwright with
all external network blocked, captures a screenshot for vision-capable models
plus console/page errors as text.

Safety properties:
- Only renders HTML strings passed by the caller (already ownership-checked
  DB rows), never navigates to a URL: no open-proxy browsing.
- Fresh browser context per call, killed afterwards; fixed viewport, hard
  timeout; no cookies, no storage, no credentials in the context.
- Playwright is optional: when missing (or disabled via settings) render
  helpers report unavailable and the agent tool is not bound, so deploys
  without browsers keep working.
"""

import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)

VIEWPORT = {"width": 1280, "height": 800}
RENDER_TIMEOUT_MS = 10_000
MAX_PREVIEWS_PER_TURN = 2
MAX_RENDERED_TEXT_CHARS = 5_000


def _launch_args() -> list:
    # Chromium refuses to start as root without --no-sandbox (prod Django
    # runs as root via systemd → TargetClosedError at launch). The browser
    # still gets a fresh profile, blocked network, no credentials, and a
    # short lifetime, so this only drops the kernel-namespace layer.
    if os.geteuid() == 0:
        return ["--no-sandbox"]
    return []


def render_available() -> bool:
    """True when server-side rendering is enabled and Playwright imports."""
    if getattr(settings, "PAGE_RENDER_ENABLED", True) is False:
        return False
    try:
        import playwright.sync_api  # noqa: F401
        return True
    except ImportError:
        return False


def render_page_shot(html: str) -> dict | None:
    """Render HTML string, return render artifact dict.

    Keys: png_bytes, console_errors, page_errors, rendered_text (visible
    body text after JS runs, capped — lets the agent safety-check what the
    page actually displays, which static source filtering cannot see).

    Returns None when rendering is unavailable. Raises nothing: Playwright
    failures are logged and returned as error text so the agent can continue.
    """
    if not render_available():
        return None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None

    console_errors: list[str] = []
    page_errors: list[str] = []
    rendered_text = ""
    png_bytes: bytes | None = None
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(args=_launch_args())
            except Exception:
                # Launch failures (missing executable, sandbox refusal as
                # root, OOM): the renderer is unavailable, so report None
                # and let the tool stay unbound / report cleanly instead of
                # burning iterations on renders that can never succeed.
                logger.exception("🌐 PAGE_RENDER_LAUNCH_FAILED")
                return None
            try:
                context = browser.new_context(viewport=VIEWPORT)
                # Block all external network: pages are single-file with
                # inline CSS/JS, so nothing legitimate needs the network and
                # kid-authored JS must not exfiltrate or fetch remote content.
                context.route("**/*", lambda route: route.abort())
                page = context.new_page()
                page.on("console", lambda msg: (
                    console_errors.append(msg.text[:500])
                    if msg.type == "error" else None
                ))
                page.on("pageerror", lambda err: page_errors.append(str(err)[:500]))
                page.set_content(html, wait_until="load", timeout=RENDER_TIMEOUT_MS)
                page.wait_for_timeout(500)
                try:
                    rendered_text = (page.inner_text("body") or "")[:MAX_RENDERED_TEXT_CHARS]
                except Exception:
                    rendered_text = ""
                png_bytes = page.screenshot()
                context.close()
            finally:
                browser.close()
    except Exception as e:
        logger.exception("🌐 PAGE_RENDER_FAILED")
        return {
            "png_bytes": None,
            "console_errors": console_errors,
            "page_errors": [*page_errors, str(e)[:500]],
            "rendered_text": rendered_text,
        }
    return {
        "png_bytes": png_bytes,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "rendered_text": rendered_text,
    }
