#!/usr/bin/env python3
"""
Build the Syft Learning promo video from the web-capture screenshots.

Renders each scene as a still (brand gradient + phone + caption), gives it a
slow push-in, cross-fades the scenes, and lays the music bed underneath.

    python3 make_promo_video.py --music /tmp/opencode/music.wav

Music: pass --music to use a licensed track instead of the generated bed.
Nothing downstream depends on which bed is used.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/marketing/1.0.6/screenshots-web")
BRAND = "#0a7ea4"
ACCENT = "#00a4c9"
DARK = "#052f42"
MUTED = "#dff2fa"
BOLD = "DejaVu-Sans-Bold"
REG = "DejaVu-Sans"

# Rendered larger than the output so zoompan has real pixels to push into.
CW, CH = 1350, 2400
OUT_W, OUT_H = 1080, 1920
FPS = 30

# (screenshot, crop fraction of screen height, headline, subline, seconds)
# The app's list screens are top-heavy — stats, activity and the bot picker are
# mostly empty below the fold. Cropping to the content keeps the phone filling
# the frame instead of trailing off into white space.
SCENES = [
    ("05-chat.png", 1.0, "She asked. The tutor\nasked back.",
     "Not the answer — the reasoning.", 6.0),
    ("08-study.png", 0.62, "Cards that come back\nwhen she'll forget them.",
     "Spaced repetition, built in.", 6.0),
    ("09-stats.png", 0.46, "It's not another tab.\nIt's a streak.", "Nine days and counting.", 6.0),
    ("11-activity.png", 0.40, "You can read\nevery conversation.",
     "Every transcript, in your hands.", 6.0),
    ("03-select-bot.png", 0.60, "A tutor per subject.",
     "Each one your kid picks.", 6.0),
]
END = ("Syft Learning", "Free to start", 5.0)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def cap(width, pts, fill, font, text, out, tmp):
    """Wrapped + trimmed caption on a transparent background."""
    p = os.path.join(tmp, "cap.png")
    run(["convert", "-size", f"{width}x1400", "-background", "none", "-fill", fill,
         "-font", font, "-pointsize", str(pts), "-alpha", "set",
         "caption:" + text, "-trim", "-depth", "8", p])
    run(["convert", p, out])


def phone(src, crop, height, radius, out, tmp):
    """Crop a capture to its content region, then frame it as a device screen."""
    dims = run(["identify", "-format", "%w %h", src]).stdout.decode().split()
    sw, sh = int(dims[0]), int(dims[1])
    ch = max(int(sh * crop), 1)
    w = int(height) * sw // ch
    p = os.path.join(tmp, "ph.png")
    run(["convert", src, "-crop", f"{sw}x{ch}+0+0", "+repage",
         "-resize", f"{w}x{height}!",
         "(", "-size", f"{w}x{height}", "xc:none", "-fill", "white",
         "-draw", f"roundrectangle 0,0,{w-1},{height-1},{radius},{radius}", ")",
         "-compose", "CopyOpacity", "-composite",
         "-stroke", "rgba(255,255,255,0.22)", "-strokewidth", "2", "-fill", "none",
         "-draw", f"roundrectangle 1,1,{w-2},{height-2},{radius},{radius}",
         "-depth", "8", p])
    run(["convert", p, out])


def scene_frame(src, crop, head, sub, out, tmp):
    """Portrait layout: framed screen above, caption below."""
    bg = os.path.join(tmp, "bg.png")
    run(["convert", "-size", f"{CW}x{CH}", f"gradient:{BRAND}-{DARK}",
         "(", "-size", f"{CW}x{CH}", "xc:none", "-fill", ACCENT,
         "-draw", f"circle {CW-140},170 {CW-140},80", ")",
         "-alpha", "set", "-compose", "over", "-composite", "-depth", "8", bg])

    # Fit the widest crop into the available box so short crops do not balloon.
    box_h, box_w = 1500, CW - 220
    dims = run(["identify", "-format", "%w %h", src]).stdout.decode().split()
    ar = (int(dims[0]) / (int(dims[1]) * crop))
    ph_h = min(box_h, int(box_w / ar))
    ph = os.path.join(tmp, "ph.png")
    phone(src, crop, ph_h, 46, ph, tmp)
    pw = int(run(["identify", "-format", "%w", ph]).stdout.decode())
    px = (CW - pw) // 2
    py = 290

    wm = os.path.join(tmp, "wm.png")
    cap(900, 40, ACCENT, BOLD, "SYFT LEARNING", wm, tmp)

    hl = os.path.join(tmp, "hl.png")
    cap(CW - 260, 78, "white", BOLD, head, hl, tmp)
    hh = int(run(["identify", "-format", "%h", hl]).stdout.decode())
    sb = os.path.join(tmp, "sb.png")
    cap(CW - 300, 40, MUTED, REG, sub, sb, tmp)
    sh = int(run(["identify", "-format", "%h", sb]).stdout.decode())

    sy = py + ph_h + 130
    if sy + hh + sh + 60 > CH:
        sy = CH - sh - hh - 110
    wm_w = int(run(["identify", "-format", "%w", wm]).stdout.decode())
    wm_x = (CW - wm_w) // 2
    run(["convert", bg,
         ph, "-geometry", f"+{px}+{py}", "-composite",
         wm, "-geometry", f"+{wm_x}+130", "-composite",
         hl, "-geometry", f"+200+{sy}", "-composite",
         sb, "-geometry", f"+200+{sy + hh + 30}", "-composite",
         "-depth", "8", out])


def scene_frame_wide(src, crop, head, sub, out, tmp):
    """Landscape layout: framed screen on the left, caption on the right.

    Reusing the portrait composition here and cropping to 16:9 collides the
    wordmark with the phone and clips the subline, so landscape gets its own
    arrangement rather than the same still at a different output size.
    """
    bg = os.path.join(tmp, "bg.png")
    run(["convert", "-size", f"{CW}x{CH}", f"gradient:{BRAND}-{DARK}",
         "(", "-size", f"{CW}x{CH}", "xc:none", "-fill", ACCENT,
         "-draw", f"circle {CW-120},120 {CW-120},50", ")",
         "-alpha", "set", "-compose", "over", "-composite", "-depth", "8", bg])

    box_h, box_w = CH - 200, int((CW - 200) * 0.42)
    dims = run(["identify", "-format", "%w %h", src]).stdout.decode().split()
    ar = (int(dims[0]) / (int(dims[1]) * crop))
    ph_h = min(box_h, int(box_w / ar))
    ph = os.path.join(tmp, "ph.png")
    phone(src, crop, ph_h, 40, ph, tmp)
    pw = int(run(["identify", "-format", "%w", ph]).stdout.decode())
    px, py = 110, (CH - ph_h) // 2

    text_x = px + pw + 110
    text_w = CW - text_x - 110

    wm = os.path.join(tmp, "wm.png")
    cap(700, 34, ACCENT, BOLD, "SYFT LEARNING", wm, tmp)
    hl = os.path.join(tmp, "hl.png")
    cap(text_w, 64, "white", BOLD, head, hl, tmp)
    hh = int(run(["identify", "-format", "%h", hl]).stdout.decode())
    sb = os.path.join(tmp, "sb.png")
    cap(text_w, 34, MUTED, REG, sub, sb, tmp)
    sh = int(run(["identify", "-format", "%h", sb]).stdout.decode())

    block = hh + sh + 34
    ty = (CH - block) // 2
    run(["convert", bg,
         ph, "-geometry", f"+{px}+{py}", "-composite",
         wm, "-geometry", f"+{text_x}+{ty - 78}", "-composite",
         hl, "-geometry", f"+{text_x}+{ty}", "-composite",
         sb, "-geometry", f"+{text_x}+{ty + hh + 34}", "-composite",
         "-depth", "8", out])


def end_frame(out, tmp):
    bg = os.path.join(tmp, "bg.png")
    run(["convert", "-size", f"{CW}x{CH}", f"gradient:{BRAND}-{DARK}",
         "(", "-size", f"{CW}x{CH}", "xc:none", "-fill", ACCENT,
         "-draw", f"circle {CW-140},170 {CW-140},80", ")",
         "-alpha", "set", "-compose", "over", "-composite", "-depth", "8", bg])
    wm = os.path.join(tmp, "wm.png")
    cap(1100, 62, ACCENT, BOLD, "SYFT LEARNING", wm, tmp)
    t1 = os.path.join(tmp, "t1.png")
    cap(CW - 200, 96, "white", BOLD, END[0], t1, tmp)
    t2 = os.path.join(tmp, "t2.png")
    cap(CW - 200, 44, MUTED, REG, "Other AI tutor bots start at $4 per month.", t2, tmp)
    t3 = os.path.join(tmp, "t3.png")
    cap(CW - 200, 52, "white", BOLD, "Free to start", t3, tmp)
    b1 = int(run(["identify", "-format", "%h", wm]).stdout.decode())
    b2 = int(run(["identify", "-format", "%h", t1]).stdout.decode())
    b3 = int(run(["identify", "-format", "%h", t2]).stdout.decode())
    b4 = int(run(["identify", "-format", "%h", t3]).stdout.decode())
    total = b1 + b2 + b3 + b4 + 60 * 3
    y = (CH - total) // 2
    run(["convert", bg,
         wm, "-gravity", "north", "-geometry", f"+0+{y}", "-composite",
         t1, "-gravity", "north", "-geometry", f"+0+{y + b1 + 60}", "-composite",
         t2, "-gravity", "north", "-geometry", f"+0+{y + b1 + b2 + 120}", "-composite",
         t3, "-gravity", "north", "-geometry", f"+0+{y + b1 + b2 + b3 + 180}", "-composite",
         "-depth", "8", out])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music", default="/tmp/opencode/music.wav")
    ap.add_argument("-o", "--out", default="/tmp/opencode/syft-promo.mp4")
    ap.add_argument("--width", type=int, default=OUT_W)
    ap.add_argument("--height", type=int, default=OUT_H)
    ap.add_argument("--work", default="/tmp/opencode/vid")
    a = ap.parse_args()

    # Compose at the output aspect so the layout is designed for it. Rendering
    # portrait stills and cropping them to 16:9 collides the wordmark with the
    # phone and clips the subline.
    global CW, CH
    if a.width > a.height:
        CW, CH = a.width + 240, a.height + 135
    else:
        CW, CH = a.width * 5 // 4, a.height * 5 // 4

    for tool in ("convert", "ffmpeg", "identify"):
        if not shutil.which(tool):
            sys.exit(f"missing required tool: {tool}")
    if not os.path.exists(a.music):
        sys.exit(f"music not found: {a.music}")

    work = a.work
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    tmp = tempfile.mkdtemp()

    frames, durs = [], []
    for i, (src, crop, head, sub, d) in enumerate(SCENES):
        f = os.path.join(work, f"s{i}.png")
        layout = scene_frame_wide if a.width > a.height else scene_frame
        layout(os.path.join(SRC, src), crop, head, sub, f, tmp)
        frames.append(f)
        durs.append(d)
        print(f"  scene {i}: {src} ({d}s)")
    f = os.path.join(work, "send.png")
    end_frame(f, tmp)
    frames.append(f)
    durs.append(END[2])
    print(f"  end card ({END[2]}s)")

    # ---- assemble: slow push-in per scene, cross-faded -----------------------
    # Each still is fed to zoompan exactly once with d=<frames>. Pairing
    # `zoompan d=1` with a looped input yields one frame per input frame and
    # silently produces a 5s freeze inside a 32s container.
    fade = 0.55
    frames_n = [max(int(round(d * FPS)), 2) for d in durs]
    total = sum(frames_n) / FPS - fade * (len(durs) - 1)

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for f in frames:
        cmd += ["-i", f]
    if a.music:
        cmd += ["-i", a.music]

    parts = []
    for i, n in enumerate(frames_n):
        parts.append(
            f"[{i}:v]zoompan=z='min(1+0.00045*in,1.06)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={n}:s={a.width}x{a.height}:fps={FPS},setsar=1,format=yuv420p[v{i}]"
        )
    prev = "v0"
    acc = frames_n[0] / FPS
    for i in range(1, len(frames)):
        off = acc - fade
        out_label = f"x{i}"
        parts.append(f"[{prev}][v{i}]xfade=transition=fade:duration={fade}:offset={off:.3f}[{out_label}]")
        prev = out_label
        acc = acc + frames_n[i] / FPS - fade
    parts.append(
        f"[{prev}]fade=t=in:st=0:d=0.5,fade=t=out:st={total-0.6:.2f}:d=0.6,format=yuv420p[vout]"
    )

    cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]"]
    cmd += ["-t", f"{total:.3f}"]
    if a.music:
        cmd += ["-map", f"{len(frames)}:a", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", a.out]

    print(f"  total {total:.1f}s -> {a.out}")
    run(cmd)
    dur = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", a.out]).stdout.decode().strip()
    print(f"  wrote {a.out}  {dur}s")


if __name__ == "__main__":
    main()
