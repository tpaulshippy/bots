"""Demo: print TurnRoute for sample kid messages + render evidence PNG."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "back"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "server.settings")

from types import SimpleNamespace  # noqa: E402

from bots.services.turn_router import route_turn  # noqa: E402

SAMPLES = [
    "Who won the Lakers game today? What's the latest score?",
    "Make me flashcards to quiz me on mitosis",
    "Build me a webpage game about dinosaurs",
    "tell me a joke, I'm bored",
    "ugh this is stupid, you're bad at explaining!!!",
    "What is 7 x 8?",
]

BOT = SimpleNamespace(name="DemoBot", enable_web_search=True, enable_html_pages=True)


def flag(v):
    return "YES" if v else "no"


def main():
    from PIL import Image, ImageDraw

    rows = []
    for msg in SAMPLES:
        r = route_turn(msg, BOT)
        rows.append((msg, r))
        print(f"msg: {msg!r}")
        print(f"  search={flag(r.needs_web_search)} flash={flag(r.needs_flashcard)} "
              f"html={flag(r.needs_html_page)} off_task={flag(r.off_task)} "
              f"frust={flag(r.frustrated)} subject={r.subject}")
        print(f"  confidences={r.confidences}")

    W, LH, PAD = 1200, 22, 16
    H = PAD * 2 + 34 + len(rows) * (LH * 4 + 14)
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.text((PAD, PAD), "Jev turn router (heuristic v1) — sample kid turns", fill="black")
    y = PAD + 34
    for msg, r in rows:
        d.text((PAD, y), f"> {msg}", fill=(0, 0, 150))
        y += LH
        d.text((PAD + 20, y),
               f"search={flag(r.needs_web_search)}  flash={flag(r.needs_flashcard)}  "
               f"html={flag(r.needs_html_page)}  off_task={flag(r.off_task)}  "
               f"frust={flag(r.frustrated)}  subject={r.subject}", fill="black")
        y += LH
        conf = " ".join(f"{k}={v:.2f}" for k, v in r.confidences.items())
        d.text((PAD + 20, y), f"p: {conf}", fill=(80, 80, 80))
        y += LH
        d.line([(PAD, y), (W - PAD, y)], fill=(200, 200, 200))
        y += 14
    out = os.path.join(os.path.dirname(__file__), "jev-turn-router.png")
    img.save(out)
    print(f"saved {out} ({W}x{H})")


if __name__ == "__main__":
    main()
