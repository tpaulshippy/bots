#!/usr/bin/env python3
"""
Build the Syft Learning promo video from RECORDED app footage.

The previous version composited stills and read as a slideshow. This one drives
the real UI: each scene is a Playwright screen recording (chat scrolling, a
flashcard being flipped, the stats view, the activity inbox, the bot picker), so
the motion is the app's own.

    python3 make-promo-video.py --music /tmp/music.wav

The app logo (front/assets/images/splash-icon.png, transparent) is burned into
every scene, and the end card is logo + name once, not the name twice.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.environ.get("CLIP_DIR", "/tmp/opencode/clips")
LOGO = os.path.join(ROOT, "front/assets/images/splash-icon.png")

BRAND = "#0a7ea4"
ACCENT = "#00a4c9"
DARK = "#052f42"
MUTED = "#dff2fa"
BOLD = "DejaVu-Sans-Bold"
REG = "DejaVu-Sans"

FPS = 30
FADE = 0.55

# (clip, in-point, duration, headline, subline)
#
# The in-points are not arbitrary: each window opens just before its scene's
# interaction and closes just after the result, so the edit shows the feature
# happening rather than a screen sitting still. They are measured off the
# recorded footage, and check_windows() fails the build if a window would end
# before the interaction does -- load time moves these by a second between
# recording runs, which silently cut the bot-editor shot off mid-word once.
#
# Measured (actions.json, 30fps source):
#   study         flip 6.0s, rated 7.6s, next card follows
#   materials     study page opens 6.8-7.3s
#   activity      transcript opens 6.4s
#   notifications chat toggle 6.0s, digest toggle 7.5s (which switches the chat
#                 toggle back off - digest suppresses instant pushes)
#   boteditor     typing runs 7.3s to 10.6s
#
# Scene order follows the three value propositions rather than a feature tour:
#   1 educational   - flashcards with spaced repetition, then study materials
#   2 parent control - transcripts, then notification preferences, then the
#                      system prompt the parent writes
#   3 price         - the end card
#
# Deliberately absent: "the tutor asks questions back", streaks, and one-bot-per-
# subject. The first sells the AI rather than the learning, the second is a
# retention mechanic, and the third is a feature detail. None of them is what
# this product is for.
SCENES = [
    ("study", 4.6, 4.6, "Cards that come back\nwhen she'll forget them.",
     "Spaced repetition, built in."),
    ("materials", 4.6, 4.4, "The tutor builds study pages\nto come back to.",
     "Made for the student, kept for later."),
    ("activity", 4.6, 3.8, "Every conversation,\nreadable.",
     "Full transcripts for every bot."),
    ("notifications", 4.4, 4.2, "You decide when\nyou're told.",
     "Straight away, a daily summary, or just study reminders."),
    ("boteditor", 5.4, 5.8, "You write the system prompt.",
     "Make a character, or a subject expert."),
]
END_DUR = 4.0
# Every scene used to cut the instant its last action finished, so the payoff
# frame flashed past -- the bot-editor shot in particular cut while the prompt
# was still being typed. tpad clones the final frame for HOLD seconds, giving
# each beat a moment to land before the crossfade starts. HOLD has to exceed
# FADE by a clear margin or the freeze is entirely consumed by the dissolve and
# nothing actually holds.
HOLD = 1.2
# A window must run at least this far past the end of its last visible action,
# otherwise the frozen hold frame shows a half-finished interaction.
MIN_TAIL = 0.4


def scene_len(i):
    """Seconds a scene occupies on the timeline, including its hold."""
    return SCENES[i][2] + HOLD


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def size_of(path):
    """Dimensions of a still, or of the first video stream of a clip.

    `identify` emits one line per frame for video, which blows up a naive
    two-value unpack, so clips go through ffprobe.
    """
    if path.endswith((".webm", ".mp4", ".mov", ".mkv")):
        out = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                   "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x",
                   path]).stdout.decode().strip()
        w, h = out.split("x")
        return int(w), int(h)
    w, h = run(["identify", "-format", "%w %h", path]).stdout.decode().split()
    return int(w), int(h)


def cap(width, pts, fill, font, text, out, tmp):
    p = os.path.join(tmp, "cap.png")
    run(["convert", "-size", f"{width}x1600", "-background", "none", "-fill", fill,
         "-font", font, "-pointsize", str(pts), "-alpha", "set",
         "caption:" + text, "-trim", "-depth", "8", p])
    run(["convert", p, out])


def logo(size, out, tmp):
    p = os.path.join(tmp, "logo.png")
    run(["convert", LOGO, "-resize", f"{size}x{size}", "-depth", "8", p])
    run(["convert", p, out])


def make_mask(w, h, radius, out, tmp):
    """White rounded rect on black, for alphamerge against a screen recording."""
    run(["convert", "-size", f"{w}x{h}", "xc:black", "-fill", "white",
         "-draw", f"roundrectangle 0,0,{w-1},{h-1},{radius},{radius}",
         "-colorspace", "Gray", "-depth", "8", out])


def background(W, H, out, tmp):
    # Plain gradient. An accent circle used to sit in the top-right corner; it
    # read as a stray UI element rather than decoration, so it is gone.
    run(["convert", "-size", f"{W}x{H}", f"gradient:{BRAND}-{DARK}",
         "-depth", "8", out])


def end_card(W, H, out, tmp, end_url, credit=""):
    bg = os.path.join(tmp, "bg.png")
    background(W, H, bg, tmp)
    lg = os.path.join(tmp, "lg.png")
    logo(int(H * 0.22), lg, tmp)
    lgw, lgh = size_of(lg)
    t1 = os.path.join(tmp, "t1.png")
    cap(int(W * 0.7), int(H * 0.038), "white", BOLD, "Syft Learning", t1, tmp)
    # Price is one of the three propositions, so it gets its own line rather
    # than being a footnote. The category anchor follows it.
    t2 = os.path.join(tmp, "t2.png")
    cap(int(W * 0.86), int(H * 0.030), MUTED, REG,
        "Free to start. $1/mo or $5/mo for more.", t2, tmp)
    t3 = os.path.join(tmp, "t3.png")
    cap(int(W * 0.86), int(H * 0.019), ACCENT, BOLD,
        "Other AI tutor bots start at $4 per month.", t3, tmp)
    blocks = [(lg, lgh), (t1, size_of(t1)[1]), (t2, size_of(t2)[1]), (t3, size_of(t3)[1])]
    if end_url:
        u = os.path.join(tmp, "u.png")
        cap(int(W * 0.7), int(H * 0.021), "white", BOLD, end_url, u, tmp)
        blocks.append((u, size_of(u)[1]))
    # Music credit. CC BY 4.0 requires attribution wherever the video is
    # published, and social captions get truncated, so it is burned into the
    # card rather than left to the caption. Small and low contrast -- it has to
    # be legible to comply, not to compete with the price line.
    if credit:
        c = os.path.join(tmp, "c.png")
        cap(int(W * 0.62), int(H * 0.0135), "#7fa6b8", REG, credit, c, tmp)
        cw, ch = size_of(c)
        args_c = [c, "-gravity", "northwest",
                  "-geometry", f"+{(W - cw) // 2}+{int(H * 0.935)}", "-composite"]
    else:
        args_c = []
    gap = int(H * 0.022)
    total = sum(h for _, h in blocks) + gap * (len(blocks) - 1)
    y = (H - total) // 2
    args = ["convert", bg]
    for path, h in blocks:
        w = size_of(path)[0]
        # northwest, not north: with -gravity north the geometry X is an offset
        # FROM CENTRE, which shoves every block off the right edge.
        args += [path, "-gravity", "northwest", "-geometry", f"+{(W-w)//2}+{y}", "-composite"]
        y += h + gap
    args += args_c
    args += ["-depth", "8", out]
    run(args)


def timeline_total():
    """Runtime of the finished cut, needed before the music bed is cut to size."""
    acc = scene_len(0)
    for i in range(1, len(SCENES)):
        acc += scene_len(i) - FADE
    return acc + END_DUR - FADE


def music_bed(src, out, total, start):
    """Cut a bar-aligned, loudness-normalised bed the exact length of the video.

    These tracks are longer than the cut, so a plain in-point avoids any loop
    seam -- the video fades to black at both ends anyway, which covers the
    boundaries. The segment starts on a bar rather than an arbitrary second, or
    the downbeat lands mid-shot.
    """
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-ss", f"{start:.3f}", "-t", f"{total + 0.6:.3f}", "-i", src,
         "-af", f"afade=t=in:st=0:d=0.6,afade=t=out:st={total - 0.4:.3f}:d=1.0,"
                "loudnorm=I=-14:TP=-1.5:LRA=11",
         "-ar", "44100", "-ac", "2", out])


def check_windows():
    """Refuse to build a window that cuts an interaction off mid-action.

    The in-points below are measured off the recorded footage, and load time
    varies between recording runs enough to move the interactions by a second
    or more -- the bot-editor typing once started 1.3s later than the window
    assumed, so the shot cut off in the middle of a word. record-promo-clips.py
    writes actions.json with the measured time of every visible action, which
    turns that from something to notice by eye into something that fails.
    """
    path = os.path.join(CLIPS, "actions.json")
    if not os.path.exists(path):
        print(f"  note: no {path}, skipping window check")
        return
    with open(path) as f:
        data = json.load(f)
    bad = []
    for name, start, dur, *_ in SCENES:
        info = data.get(name) or {}
        acts = info.get("actions") or []
        if not acts:
            continue
        last = max(a[1] for a in acts)
        clip = info.get("duration") or 0
        need = last + MIN_TAIL
        if start + dur < need:
            bad.append(f"  {name}: window {start:.1f}+{dur:.1f} ends at {start + dur:.1f}s "
                       f"but the action runs to {last:.1f}s -> duration must be "
                       f"at least {need - start:.1f}s (clip is {clip:.1f}s)")
    if bad:
        sys.exit("scene window cuts an interaction short:\n" + "\n".join(bad))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--music", default="")
    ap.add_argument("--music-start", type=float, default=0.0)
    ap.add_argument("--credit", default="")
    ap.add_argument("-o", "--out", default="docs/marketing/1.0.6/video/syft-promo-9x16.mp4")
    ap.add_argument("--width", type=int, default=1080)
    ap.add_argument("--height", type=int, default=1920)
    ap.add_argument("--end-url", default="")
    ap.add_argument("--work", default="/tmp/opencode/vid2")
    a = ap.parse_args()

    for t in ("convert", "ffmpeg", "ffprobe", "identify"):
        if not shutil.which(t):
            sys.exit(f"missing tool: {t}")
    if not os.path.exists(LOGO):
        sys.exit(f"logo not found: {LOGO}")
    for name, *_ in SCENES:
        if not os.path.exists(os.path.join(CLIPS, f"{name}.webm")):
            sys.exit(f"missing clip: {CLIPS}/{name}.webm (run record_clips.py first)")
    check_windows()

    W, H = a.width, a.height
    landscape = W > H
    work = a.work
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    tmp = tempfile.mkdtemp()

    # Phone occupies the left half in landscape, the upper block in portrait.
    if landscape:
        ph_h = int(H * 0.86)
        text_x = int(W * 0.50)
        text_w = W - text_x - int(W * 0.06)
    else:
        ph_h = int(H * 0.615)
        text_x = int(W * 0.07)
        text_w = int(W * 0.86)
    clip_w, clip_h = size_of(os.path.join(CLIPS, f"{SCENES[0][0]}.webm"))
    # alphamerge into yuva420p needs even dimensions; an odd width here fails
    # with "Input frame sizes do not match" once the pixel format rounds it down.
    ph_w = (int(ph_h * clip_w / clip_h) // 2) * 2
    ph_h = (ph_h // 2) * 2
    ph_x = int(W * 0.06) if landscape else (W - ph_w) // 2
    ph_y = (H - ph_h) // 2 if landscape else int(H * 0.145)

    lg = int(min(W, H) * (0.16 if landscape else 0.125))
    lg_x = (W - lg) // 2 if not landscape else text_x + 18
    lg_y = int(H * 0.048) if not landscape else int(H * 0.20)

    # --- per-scene overlay assets -------------------------------------------
    bg = os.path.join(work, "bg.png")
    background(W, H, bg, tmp)
    mask = os.path.join(work, "mask.png")
    make_mask(ph_w, ph_h, int(ph_w * 0.07), mask, tmp)
    lg_png = os.path.join(work, "logo.png")
    logo(lg, lg_png, tmp)

    heads, subs, hh, shmax = [], [], 0, 0
    for i, (_, _, _, head, sub) in enumerate(SCENES):
        h = os.path.join(work, f"h{i}.png")
        s = os.path.join(work, f"s{i}.png")
        cap(text_w, int(min(W, H) * (0.040 if landscape else 0.050)), "white", BOLD, head, h, tmp)
        cap(text_w, int(min(W, H) * (0.020 if landscape else 0.024)), MUTED, REG, sub, s, tmp)
        heads.append(h)
        subs.append(s)
        hh = max(hh, size_of(h)[1])
        shmax = max(shmax, size_of(s)[1])

    end = os.path.join(work, "end.png")
    end_card(W, H, end, tmp, a.end_url, a.credit)

    # --- assemble ------------------------------------------------------------
    # Input order: 0..n-1 clips, n mask, n+1 bg, n+2 end card, n+3 logo,
    # then 2n headline/sub pairs, then music. Derive the indices from n rather
    # than hardcoding, or the pairs collide with the shared overlays.
    n = len(SCENES)
    I_MASK, I_BG, I_END, I_LOGO = n, n + 1, n + 2, n + 3
    I_HEAD0 = n + 4

    if a.music and not os.path.exists(a.music):
        sys.exit(f"music not found: {a.music}")
    music = a.music
    if music and a.music_start:
        # Cut the bed to the finished runtime, which depends on the hold
        # lengths above, so this has to happen once the timeline is known.
        bed = os.path.join(work, "bed.wav")
        music_bed(music, bed, timeline_total(), a.music_start)
        music = bed

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for name, *_ in SCENES:
        cmd += ["-i", os.path.join(CLIPS, f"{name}.webm")]
    cmd += ["-loop", "1", "-i", mask, "-loop", "1", "-i", bg,
            "-loop", "1", "-i", end, "-loop", "1", "-i", lg_png]
    for i in range(n):
        cmd += ["-loop", "1", "-i", heads[i], "-loop", "1", "-i", subs[i]]
    if music:
        cmd += ["-i", music]
    music_idx = I_HEAD0 + 2 * n

    parts = []
    for i, (_, start, dur, _, _) in enumerate(SCENES):
        h_i, s_i = I_HEAD0 + 2 * i, I_HEAD0 + 2 * i + 1
        if landscape:
            # logo sits above the headline in the right-hand column; putting it
            # over the phone column puts it on top of the screen recording.
            gap = int(H * 0.028)
            block = lg + gap + hh + gap + shmax
            top = (H - block) // 2
            lg_y, hl_y, sl_y = top, top + lg + gap, top + lg + gap + hh + gap
        else:
            hl_y = ph_y + ph_h + int(H * 0.040)
            sl_y = hl_y + hh + 30
        parts.append(
            f"[{i}:v]trim=start={start}:duration={dur},"
            f"tpad=stop_mode=clone:stop_duration={HOLD},setpts=PTS-STARTPTS,"
            f"fps={FPS},scale={ph_w}:{ph_h}:force_original_aspect_ratio=increase,"
            f"crop={ph_w}:{ph_h},setsar=1,format=yuva420p[p{i}];"
            f"[{I_MASK}:v]scale={ph_w}:{ph_h},format=gray[m{i}];"
            f"[p{i}][m{i}]alphamerge[pm{i}];"
            f"[{I_BG}:v][pm{i}]overlay={ph_x}:{ph_y}:shortest=1[phv{i}];"
            f"[phv{i}][{I_LOGO}:v]overlay={lg_x}:{lg_y}:shortest=1[l{i}];"
            f"[l{i}][{h_i}:v]overlay={text_x}:{hl_y}:shortest=1[hh{i}];"
            f"[hh{i}][{s_i}:v]overlay={text_x}:{sl_y}:shortest=1[v{i}]"
        )

    end_dur = END_DUR
    prev = "v0"
    acc = scene_len(0)
    for i in range(1, n):
        off = acc - FADE
        parts.append(f"[{prev}][v{i}]xfade=transition=fade:duration={FADE}:offset={off:.3f}[x{i}]")
        prev = f"x{i}"
        acc = acc + scene_len(i) - FADE
    total = acc + end_dur - FADE
    assert abs(total - timeline_total()) < 1e-6, (total, timeline_total())
    parts.append(f"[{prev}][{n+2}:v]xfade=transition=fade:duration={FADE}:offset={acc-FADE:.3f}[xe]")

    fade_out = total - 0.7
    parts.append(f"[xe]trim=duration={total:.3f},setpts=PTS-STARTPTS,"
                 f"fade=t=in:st=0:d=0.5,fade=t=out:st={fade_out:.2f}:d=0.7,format=yuv420p[vout]")

    cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]"]
    if music:
        cmd += ["-map", f"{music_idx}:a"]
    cmd += ["-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", "-r", str(FPS)]
    if music:
        cmd += ["-c:a", "aac", "-b:a", "192k"]
    cmd += ["-movflags", "+faststart", a.out]

    print(f"  {n} scenes + end card, {total:.1f}s -> {a.out}")
    run(cmd)
    d = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", a.out]).stdout.decode().strip()
    print(f"  wrote {a.out}  {d}s")


if __name__ == "__main__":
    main()
