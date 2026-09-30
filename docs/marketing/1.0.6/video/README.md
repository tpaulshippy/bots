# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 25s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 25s | YouTube, LinkedIn, X |

30fps H.264 (yuv420p, faststart) with an AAC stereo bed. The two cuts are
generated from the same scenes, not exported from one another, so each is
composed for its own aspect.

## Scenes

| # | Clip | On-screen line | Prop | Dur |
|---|---|---|---|---|
| 1 | study — a flashcard being flipped | Cards that come back when she'll forget them. | 1 | 4.6s |
| 2 | study materials — the tutor's pages | The tutor builds study pages to come back to. | 1 | 4.2s |
| 3 | activity — inbox scrolling | Every conversation, readable. | 2 | 4.8s |
| 4 | notifications — parent toggles | You decide when you're told. | 2 | 4.0s |
| 5 | bot editor — system prompt | You write the system prompt. | 2 | 5.0s |
| 6 | end card | Free to start. $1/mo or $5/mo for more. | 3 | 5s |

Scene order follows the three propositions, not a feature tour. Deliberately absent:
"the tutor asks questions back", streaks, and one-bot-per-subject — see `ROLLOUT.md`
§1 "What we stopped leading with".

Cross-faded, 0.5s fade in / 0.7s fade out. 25s total.

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

It is a **drum groove** at 88 BPM — kick, snare with ghost notes, hats on 8ths, and
a chord-root bass, over I–V–vi–IV, with a little swing and the bass ducked off each
kick. Every voice is synthesised: pitch-swept sine kick, noise-over-tone snare,
highpassed noise hats, and a sparse detuned stab on the hook.

Two earlier attempts were rejected on feedback: an ambient pad, then a bell
arpeggio. Neither carried a short promo.

Measured: 88 BPM confirmed by onset autocorrelation (0.65 at one beat, 0.86 per
bar), 17.6% of energy above 4kHz and 6% above 8kHz — a warm lo-fi balance, after a
first pass left 19% above 12kHz and read as hiss on phone speakers. Mean −17.5 dB,
peak −1.3 dBFS.

It is still a generated groove, not a produced track. If you want something that
feels professionally played and mixed, pass your own:

```bash
python3 scripts/make-promo-video.py --music /path/to/licensed.mp3 -o ...
```

Nothing downstream depends on where the audio came from.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see `POSTS.md` § "On the price anchor".
