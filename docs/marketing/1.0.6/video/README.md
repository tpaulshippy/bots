# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 32s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 32s | LinkedIn, YouTube, X |

Both are 30fps H.264 (yuv420p, faststart) with an AAC stereo bed. The two cuts
are generated from the same scenes, not exported from one another, so each is
composed for its own aspect: portrait stacks screen over caption, landscape puts
the screen left and the caption right.

## Scenes

| # | Screen | On-screen line | Dur |
|---|---|---|---|
| 1 | `05-chat` | She asked. The tutor asked back. | 6s |
| 2 | `08-study` | Cards that come back when she'll forget them. | 6s |
| 3 | `09-stats` | It's not another tab. It's a streak. | 6s |
| 4 | `11-activity` | You can read every conversation. | 6s |
| 5 | `03-select-bot` | A tutor per subject. | 6s |
| 6 | end card | Free to start | 5s |

Cross-faded, with a slow push-in on each scene and a 0.5s fade in / 0.6s fade out.

## Regenerating

```bash
# 1. music bed (optional — see below)
python3 scripts/make-promo-music.py -o /tmp/music.wav -d 48

# 2. both cuts
python3 scripts/make-promo-video.py --music /tmp/music.wav \
  -o docs/marketing/1.0.6/video/syft-promo-9x16.mp4
python3 scripts/make-promo-video.py --music /tmp/music.wav \
  -o docs/marketing/1.0.6/video/syft-promo-16x9.mp4 --width 1920 --height 1080
```

Needs ImageMagick (`convert`), `ffmpeg`, `ffprobe`, and the DejaVu fonts — the same
as `make-marketing-assets.sh`. Frames are staged in `/tmp/opencode/vid`; override
with `--work`.

## The music

`scripts/make-promo-music.py` **synthesises the bed from scratch** — sine/triangle
stacks, a bell arpeggio, soft kick and shaker, at 84 BPM in Fmaj7–C–G–Am. There is
no sampled or licensed audio in it, so there are no third-party rights attached
to the shipped video.

It is deliberately plain and sits well under captions. If you have a licensed
track you like more, pass it instead — nothing downstream depends on where the
audio came from:

```bash
python3 scripts/make-promo-video.py --music /path/to/licensed.mp3 -o ...
```

Level check on the shipped bed: mean −16 dB, peak −1 dB, present through the
full runtime.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see the caveats in `POSTS.md` § "On the price anchor".
