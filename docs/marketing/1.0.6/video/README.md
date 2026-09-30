# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 28s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 28s | YouTube, LinkedIn, X |

30fps H.264 (yuv420p, faststart) with an AAC stereo bed. The two cuts are
generated from the same scenes, not exported from one another, so each is
composed for its own aspect.

## Scenes

| # | Clip | On-screen line | Dur |
|---|---|---|---|
| 1 | chat — transcript scrolling | She asked. The tutor asked back. | 6.5s |
| 2 | study — a flashcard being flipped | Cards that come back when she'll forget them. | 4.6s |
| 3 | stats | It's not another tab. It's a streak. | 4.5s |
| 4 | activity — inbox scrolling | You can read every conversation. | 5.5s |
| 5 | bot picker | A tutor per subject. | 4.5s |
| 6 | end card | Free to start | 5s |

Cross-faded, 0.5s fade in / 0.7s fade out.

**These are real screen recordings, not stills.** Every scene is a Playwright
capture of the seeded app driven through the actual UI — the chat transcript
scrolls, the flashcard flips to reveal the answer and the Again/Hard/Good/Easy
rating row. An earlier version composited screenshots and read as a slideshow.

The app logo (`front/assets/images/splash-icon.png`, transparent) is burned into
every scene. The end card is the logo plus the name **once** — the previous
version spelled the name twice, once as a text wordmark and once as the title.

## Regenerating

Order matters: the recorder needs the app running, the compositor needs the clips.

```bash
# 1. backend seeded and running on :8000, web export built to front/dist
#    (see docs/marketing/1.0.6/README.md for the full local setup)
python3 back/manage.py seed_promo_demo            # from back/

# 2. record the clips
python3 scripts/record-promo-clips.py             # -> /tmp/opencode/clips/*.webm

# 3. music bed (optional, see below)
python3 scripts/make-promo-music.py -o /tmp/music.wav -d 40

# 4. both cuts
python3 scripts/make-promo-video.py --music /tmp/music.wav \
  -o docs/marketing/1.0.6/video/syft-promo-9x16.mp4
python3 scripts/make-promo-video.py --music /tmp/music.wav \
  -o docs/marketing/1.0.6/video/syft-promo-16x9.mp4 \
  --width 1920 --height 1080 --end-url syftlearning.app
```

Needs ImageMagick (`convert`), `ffmpeg`, `ffprobe`, the DejaVu fonts, and Python
with `playwright` + `numpy`. The 16:9 cut is rendered with the domain burned into
the end card, because YouTube description links barely convert and the end card is
the only CTA that survives there. The 9:16 cut has no URL — it is wrong on Reels
and TikTok, where nothing is tappable.

## The music

`scripts/make-promo-music.py` **synthesises the bed from scratch**, so nothing
licensed is embedded in the shipped video. There is no sampled or third-party
audio anywhere in it.

It is ambient only: a detuned sine pad over Fmaj9–Em7–Am7–Cadd9 at 66 BPM, a soft
sub breath, sparse high shimmer, and a real convolution reverb (FFT against a
synthetic exponentially-decaying noise IR) with a 3.4s tail. **No percussion and
no melody line** — the first version had a 16th-note bell arpeggio over a saw pad
with only a short delay, which read as a cheap synth loop and fought the captions.

Mix: ~64% low-mid, 2% presence, RMS 0.126, peak −1.7 dBFS. It is meant to sit
under the captions and be barely noticed. It is still a generated bed, not a
produced track — if you want something that feels professionally scored, pass your
own:

```bash
python3 scripts/make-promo-video.py --music /path/to/licensed.mp3 -o ...
```

Nothing downstream depends on where the audio came from.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see `POSTS.md` § "On the price anchor".
