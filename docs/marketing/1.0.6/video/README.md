# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 31.6s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 31.6s | YouTube, LinkedIn, X |

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

Those are the authored windows. With `--bpm 116` they are quantised up to the
beat grid, which lands the cuts at 5.69s, 10.86s, 15.52s, 20.69s and 27.41s —
beats 11, 21, 30, 40 and 53 at that tempo. Each cut is a whole number of
quarter notes; `plan_timeline()` is what computes them.

Scene order follows the three propositions, not a feature tour. Deliberately absent:
"the tutor asks questions back", streaks, and one-bot-per-subject — see `ROLLOUT.md`
§1 "What we stopped leading with".

Cross-faded (0.55s), 0.5s fade in / 0.7s fade out. 31.57s total, cut on
the beat grid at 116 BPM.

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

The music bed is **not** vendored — it is a licensed track, so it does not belong in
the repo. Point `--music` at your copy and pass `--bpm` with its tempo; see
"Staying in sync with the music" below. If you swap the track, re-measure the
tempo: `--bpm` is not stored anywhere, and a wrong value puts the cuts between
beats without failing the build.

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
  --music <track> --bpm 116 \
  -o docs/marketing/1.0.6/video/syft-promo-9x16.mp4

python3 scripts/make-promo-video.py \
  --music <track> --bpm 116 \
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

This is what makes a track a drop-in: generate at whatever tempo it comes out,
pass `--bpm <tempo>`, and the edit follows. Nothing else changes.

The grid is a **quarter note, not a bar**. Snapping to whole bars costs 15-25%
runtime — 37.6s from a 30.1s cut at 102 BPM — because each scene rounds up by
most of a bar. A beat grid costs 3-5% and still puts every cut on a beat, which
is what actually reads as synchronised.

| Grid | 102 BPM runtime | vs 30.1s unsynced |
|---|---|---|
| bar | 37.6s | +25% |
| half-bar | 34.1s | +14% |
| **beat (quarter note)** | **31.2s** | **+4%** |

### Picking the tempo

`--bpm` is passed by hand and nothing validates it, so a wrong value puts cuts
between beats and the build still succeeds. Two things to check before shipping:

Onset autocorrelation is not enough on its own. This track's candidates were 68
and 137 (the same pulse), plus 86, 103 and 120 — no clear winner.

Scoring each candidate tempo by how much onset energy actually lands under the
five cut points is what settled it. Random cut positions score 0.49; 116 BPM
scored 2.52 with every one of the five cuts positive, against 0.80 for a rounder
120 BPM. With only five cuts this is noisy, so treat a clear winner as usable and
a marginal one as not.

Two templates to re-run against a new track:

```python
# 1. tempo candidates
flux = onset_strength_envelope(audio)          # STFT -> positive spectral flux
ac = np.correlate(flux, flux, "full")[len(flux)-1:]

# 2. which candidate actually puts cuts on transients
for bpm in range(64, 181):
    cuts = plan_timeline(bpm)[0]
    score = mean(onset_strength_at(t) for t in cuts)
```

Only transitions are synced. The interactions inside each scene are screen
recordings, so a flashcard flip cannot be placed on the snare without
re-recording with beat-locked cues.

Each scene's cloned hold (`tpad`) covers `HOLD` + `FADE` + the grid's rounding
slack. Padding only to `HOLD` left each outgoing fade running past the end of its
own stream — the cut out of `study` was over a second short, and the fade visibly
snapped rather than dissolving.

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

The bed is a Suno-generated instrumental supplied by the project owner, trimmed
and normalised to −14 LUFS, cut on its beat grid at **116 BPM**.

### Licensing — read before publishing

**This track carries no third-party attribution requirement.** Suno output is
owned by the account that generated it, so there is nothing to credit in the
video, the caption or the description. The `--credit` flag is therefore not
passed for the shipped cuts, and the end card carries no music line.

The obligation is on the other side and is not optional: Suno's commercial-use
rights apply to songs generated **while a paid plan is active**, and they are
not retroactive. A track generated on the free plan stays non-commercial even
after upgrading. Confirm the track in hand was made on Pro or Premier before it
ships in a paid campaign.

That is also why this section exists at all. The previous bed was Kevin MacLeod's
"Groundwork" under CC BY 4.0, which *did* require attribution — burned into the
end card, with a matching description credit for YouTube, and a Content ID
dispute to expect on upload. All of that is gone with the swap, and it is worth
knowing what it bought: no claim to dispute and no licence text to maintain.

If a licensed library track is ever substituted, put the credit back:

```bash
--credit "<title> by <author> — <licence> <url>"
```

and check whether the source registers with YouTube Content ID. `POSTS.md` §A5
carries the description-credit wording for that case.

### Why the track is looped

This one is 29.97s and the cut is 31.57s, so the bed is looped with a
crossfaded seam to cover the remainder. A hard butt would be audible — this track
starts at 49% of peak and finishes at 77%, so it never resolves to silence. The
crossfade is over 1.2s, and the measured step across the seam is 0.0005 against
a 0.998 peak.

`loop_to()` does this for any short track, so a future 20s bed would work too.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see `POSTS.md` § "On the price anchor".

No competitor is named anywhere in the video or the copy.
