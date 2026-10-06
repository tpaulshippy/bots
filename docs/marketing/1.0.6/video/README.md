# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 31.2s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 31.2s | YouTube, LinkedIn, X |

30fps H.264 (yuv420p, faststart) with an AAC stereo bed. The two cuts are
generated from the same scenes, not exported from one another, so each is
composed for its own aspect.

## Scenes

| # | Clip | On-screen line | Prop | Window | Hold |
|---|---|---|---|---|---|
| 1 | study — card flipped, rated, next card | Cards that come back when she'll forget them. | 1 | 4.6s | 1.2s |
| 2 | study materials — the tutor's page opens | The tutor builds study pages to come back to. | 1 | 4.4s | 1.2s |
| 3 | activity — transcript opens | Every conversation, readable. | 2 | 3.8s | 1.2s |
| 4 | notifications — parent flips two toggles | You decide when you're told. | 2 | 4.2s | 1.2s |
| 5 | bot editor — system prompt typed | You write the system prompt. | 2 | 5.8s | 1.2s |
| 6 | end card | Free to start. $1/mo or $5/mo for more. | 3 | 4.0s | — |

Scene order follows the three propositions, not a feature tour. Deliberately absent:
"the tutor asks questions back", streaks, and one-bot-per-subject — see `ROLLOUT.md`
§1 "What we stopped leading with".

Cross-faded (0.55s), 0.5s fade in / 0.7s fade out. 31.18s total, cut on
the beat grid at 102 BPM.

**Every scene holds for 1.2s on its final frame** (`tpad=stop_mode=clone`) before
the crossfade starts. Cutting the instant an action finished made the payoff frame
flash past. HOLD has to stay comfortably above FADE, or the freeze is consumed by
the dissolve and nothing visibly holds.

**These are real screen recordings, not stills.** Every scene is a Playwright
capture of the seeded app driven through the actual UI: a flashcard is flipped and
rated so the next one loads, a study page is opened, a transcript is opened, the
notification toggles are flipped, and text is typed into the system prompt field.
An earlier version composited screenshots and read as a slideshow; a later one
loaded each screen and sat on it, which proved nothing worked.

The app logo (`front/assets/images/splash-icon.png`, transparent) is burned into
every scene. The end card is the logo plus the name **once** — the previous
version spelled the name twice, once as a text wordmark and once as the title.

## Regenerating

Order matters: the recorder needs the app running, the compositor needs the clips.

The music bed is **not** vendored — it is CC BY 4.0, not public domain, so it does
not belong in the repo. Fetch it, and keep the copy you ship against:

```bash
mkdir -p /tmp/opencode/music
curl -L -o /tmp/opencode/music/Groundwork.mp3 \
  'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Groundwork.mp3'
```

Verify you got the track you think you did before trusting the output. The
in-point in the commands below assumes a bar length of 2.353s (102 BPM), so a
different file silently lands the music off-beat:

```bash
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 \
  /tmp/opencode/music/Groundwork.mp3    # expect ~169s
```

Re-check the licence text before every campaign; it is at
<https://incompetech.com/music/royalty-free/licenses/> and the terms have changed
before.

```bash
# 1. backend seeded and running on :8000, web export built to front/dist.
#    The recorder re-seeds the demo data itself (see "Seeding" below), so
#    running the seed command by hand is optional -- run it only to inspect the
#    data by hand. Note the path is relative to the repo root, not back/.
python3 back/manage.py seed_promo_demo

# 2. record the clips -> /tmp/opencode/clips/*.webm plus actions.json
python3 scripts/record-promo-clips.py

# 3. both cuts. --bpm snaps every cut to the track's beat grid; see below.
python3 scripts/make-promo-video.py \
  --music /tmp/opencode/music/Groundwork.mp3 --music-start 101.2 --bpm 102 \
  --credit "Groundwork by Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 · creativecommons.org/licenses/by/4.0/" \
  -o docs/marketing/1.0.6/video/syft-promo-9x16.mp4

python3 scripts/make-promo-video.py \
  --music /tmp/opencode/music/Groundwork.mp3 --music-start 101.2 --bpm 102 \
  --credit "Groundwork by Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 · creativecommons.org/licenses/by/4.0/" \
  -o docs/marketing/1.0.6/video/syft-promo-16x9.mp4 \
  --width 1920 --height 1080 --end-url syftlearning.app
```

### Prerequisites

```bash
pip install playwright numpy     # numpy is not in back/requirements.txt
python3 -m playwright install chromium   # the package alone does not fetch it
```

Also needs ImageMagick (`convert`), `ffmpeg`, `ffprobe`, and the DejaVu fonts. The
`playwright install` step is not optional: installing the Python package does not
download the browser, and `record-promo-clips.py` fails at
`BrowserType.launch: Executable doesn't exist` without it.

The 16:9 cut is rendered with the domain burned into the end card, because YouTube
description links barely convert and the end card is the only CTA that survives
there. The 9:16 cut has no URL — it is wrong on Reels and TikTok, where nothing is
tappable.

## Staying in sync with the music

`--bpm` snaps every scene boundary and the end card to the track's beat grid, so
the cuts land on beats instead of wherever the footage happened to run out. It is
derived from the tempo you pass, not baked in, so a different track re-times the
whole cut with no edit to `SCENES`. Without it, durations are used as authored.

This is what makes a Suno track a drop-in later: generate at whatever tempo it
comes out, pass `--bpm <tempo>`, and the edit follows. Nothing else changes.

The grid is a **quarter note, not a bar**. Snapping to whole bars costs 15-25%
runtime — 37.6s from a 30.1s cut at 102 BPM — because each scene rounds up by
most of a bar. A beat grid costs 3-5% and still puts every cut on a beat, which
is what actually reads as synchronised.

| Grid | 102 BPM runtime | vs 30.1s unsynced |
|---|---|---|
| bar | 37.6s | +25% |
| half-bar | 34.1s | +14% |
| **beat (quarter note)** | **31.2s** | **+4%** |

Only transitions are synced. The interactions inside each scene are screen
recordings, so a flashcard flip cannot be placed on the snare without
re-recording with beat-locked cues.

`check_timeline()` fails the build if snapping would truncate a scene below its
own window. An early attempt did exactly that — it cut scenes to 2.9s when their
window was 5.6s — and the failure is now impossible to ship.

`plan_timeline()` is the single source of truth for the runtime. It is read by
both the music bed and the filter graph, because computing it twice is how the
bed once ended up 0.6s longer than the video.

### Scene windows are checked, not eyeballed

Load time varies between recording runs by more than a second, which moves every
interaction. The in-point table above was measured off one recording and had already
been wrong once — the bot-editor typing started 1.3s later than assumed, so the shot
cut off in the middle of a word, which read as "cuts off too fast".

So `record-promo-clips.py` writes `clips/actions.json` with the measured start and
end of every visible action, and `make-promo-video.py` **exits with an error** if a
window would end before its action does:

```
scene window cuts an interaction short:
  boteditor: window 5.0+5.0 ends at 10.0s but the action runs to 10.6s
  -> duration must be at least 6.0s (clip is 14.9s)
```

If you re-record and the check fires, copy the suggested duration into `SCENES`
rather than trimming the clip.

## The music

The bed is **"Groundwork" by Kevin MacLeod** (incompetech.com), trimmed from 101.2s
and normalised to −14 LUFS. That is bar 43, where the track's longest stretch of
full-energy bars begins, so the cut starts on a downbeat with the arrangement
already up instead of on a sparse intro.

### Licensing — read before publishing

The licence is **CC BY 4.0**. Concretely:

- **Commercial use is permitted**, including monetised YouTube. Both are explicitly
  allowed, and the track does not need to be purchased.
- **Attribution is required**, placed so that "a person who wants to know where the
  music came more or less should have no difficulty in finding it." For video, in
  the video itself *or* in the description both qualify.
- **Trimming does not need disclosing.** He states there is no need to mention cut
  or splice, which is what `--music-start` does.
- **It is royalty-free, not public domain.** All of the catalogue is copyrighted.

Use the credit exactly as prescribed:

Burned into the end card, and the identical wording goes in the YouTube
description (`POSTS.md` §A5). Keep them the same -- the burned-in and posted
credits differing is what makes an auditor distrust the credit:

```
Groundwork by Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 · creativecommons.org/licenses/by/4.0/
```

The description form wraps onto three lines, which is how it should read there:

```
Groundwork by Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
https://creativecommons.org/licenses/by/4.0/
```

It is burned into the end card via `--credit`, because social captions get truncated
and a licence condition that depends on the caption surviving is not one to rely on.

**The YouTube problem, which is not hypothetical.** The catalogue is now
pre-registered with YouTube Content ID, deliberately, to stop other people falsely
claiming it. Uploading the Shorts in `POSTS.md` §A5 *will* draw a copyright claim.
It is released within 72 hours, and much faster, **but only if the credit is already
in the video description before you dispute it** — a burned-in credit is not
machine-readable, which is the usual reason the release stalls. Not a strike; ad
revenue is simply held until it clears. The description credit and the dispute step
are written into `POSTS.md` §A5 for that reason.

If the Content ID friction is not worth it, he points at **Pixabay** for
public-domain music instead, where there is no claim to dispute. Pixabay returns
403 to scripted requests, so it has to be done by hand.

### Choosing the track

Tracks were scored on the two ways the earlier beds failed — harshness and fatigue:

| Track | BPM | >4kHz | Crest | 1s-RMS CV | |
|---|---|---|---|---|---|
| Newer Wave | 110 | 4.3% | 1.75 | 0.23 | hissy, rejected |
| Look Busy | 100 | 0.5% | 3.18 | 0.40 | uneven, rejected |
| Happy Alley | 112 | 0.2% | 1.80 | 0.29 | muffled, rejected |
| Super Friendly | 108 | 0.2% | 3.01 | 0.30 | muffled, rejected |
| **Groundwork** | 102 | 1.1% | 1.99 | **0.10** | used |
| Blue Ska | 110 | 1.0% | 1.91 | 0.22 | runner-up, catchier beat |
| How it Begins | 96 | 0.7% | 2.51 | 0.26 | runner-up, calmest |

Crest factor is what separates a drum you can hear from a dense mix that tires;
the 1s-RMS coefficient of variation is evenness. Newer Wave carries 4.3% of its
energy above 4kHz, which is what reads as hiss on a phone speaker, and Look Busy
swings 40% between adjacent seconds.

Passing `--music-start` makes the script cut the bed to the finished runtime, with
fades, rather than using the track as-is. Omit it and the file is used directly.
The tracks are all longer than the cut, so there is no loop seam to hide.

`scripts/make-promo-music.py` still synthesises a bed from scratch and is kept as a
fallback for when no licensed track is available — it embeds no third-party audio
at all, so it carries no attribution obligation. But it is a generated groove, not
a produced track, and it is no longer what ships.

It also takes `--bpm`, so a generated bed can be cut to the grid like any other
track. `--seed` genuinely varies the output (it reaches the three noise voices);
before that it was accepted and ignored, producing byte-identical WAVs.

Nothing downstream depends on where the audio came from. The bed measures
−13.5 LUFS integrated, LRA 1.4 LU on the finished video.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see `POSTS.md` § "On the price anchor".

No competitor is named anywhere in the video or the copy.
