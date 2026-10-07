# Promo video — 1.0.6

| File | Size | Use |
|---|---|---|
| `syft-promo-9x16.mp4` | 1080×1920, 31.3s | IG Reels, FB Reels, TikTok, Shorts, X |
| `syft-promo-16x9.mp4` | 1920×1080, 31.3s | YouTube, LinkedIn, X |

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

Those are the authored windows. With `--bpm 163` they are quantised up to the
beat grid, which lands the cuts at 5.52s, 10.67s, 15.46s, 20.61s and 27.24s —
beats 15, 29, 42, 56 and 74 at that tempo. Each cut is a whole number of
quarter notes; `plan_timeline()` is what computes them.

Scene order follows the three propositions, not a feature tour. Deliberately absent:
"the tutor asks questions back", streaks, and one-bot-per-subject — see `ROLLOUT.md`
§1 "What we stopped leading with".

Cross-faded (0.55s), 0.5s fade in / 0.7s fade out. 31.29s total, cut on
the beat grid at 163 BPM.

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
  --music <track> --music-start 1.47 --bpm 163 \
  -o docs/marketing/1.0.6/video/syft-promo-9x16.mp4

python3 scripts/make-promo-video.py \
  --music <track> --music-start 1.47 --bpm 163 \
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

**Autocorrelation is the primary measure.** Restrict it to the strongest few
percent of onsets — kick and snare rather than hats — and a real tempo usually
separates cleanly from its own half- or double-time. On the current track that
gives 163 BPM at 1.000 against 81 at 0.542.

A secondary check scores each candidate by how much onset energy lands under the
five cut points. It is worth running, and worth distrusting: on the current track
it scores 79 BPM at 3.09 and 80 BPM at 0.34, which cannot both be true of
neighbouring tempos. Five cut points is a sample too small to discriminate, and a
one-BPM difference moving the score tenfold is a warning sign, not a result.

When the two disagree, trust the autocorrelation. Use the cut-point score only to
confirm a clear winner — where it puts every cut above zero and well clear of the
random baseline — and treat a marginal one as undecided.

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

The bed is a Treblo-generated instrumental supplied by the project owner, taken
from **1.47s** and normalised to −14 LUFS, cut on its beat grid at **163 BPM**.

The source is a 33.7s excerpt of a longer Treblo generation. It starts
mid-phrase — onset strength 0.30 at 0s against 1.41 one bar in — so the bed is
entered a bar later rather than from the top, which puts the music's first
downbeat under the video's first frame. Any bar-aligned start preserves "cuts
land on beats"; this one additionally starts on a real onset.

### Licensing — read before publishing

**No attribution is required and no third-party claim is expected.** Treblo output
is supplied as unrestricted for commercial use, so `--credit` is not passed for
the shipped cuts and the end card carries no music line.

Unlike the Suno track this replaced, there is no paid-plan condition to check:
those rights were not retroactive, so a track generated on a free plan stayed
non-commercial even after upgrading. Nothing here depends on which plan the
generating account was on.

Two earlier beds, and what each cost:

**Kevin MacLeod, "Groundwork" (CC BY 4.0).** Required attribution — burned into
the end card, with a matching description credit for YouTube — and his catalogue
is pre-registered with Content ID, so the Shorts upload drew a claim to dispute.
Real cost in maintenance and in ad revenue held until it cleared.

**A Suno instrumental.** No attribution and no claim, but commercial rights apply
only to songs generated while a paid plan was active, and not retroactively.

If a licensed library track is ever substituted, put the credit back and check
whether the source registers with Content ID:

```bash
--credit "<title> by <author> — <licence> <url>"
```

`POSTS.md` §A5 carries description-credit wording for that case.

### Why the tempo is 163 and not 81

Autocorrelation on the full onset envelope gives 163 BPM at 0.976 strength, with
81 as its half-time at 0.541 — the same pulse, felt at half speed. Restricting to
the strongest 3% of onsets (kick and snare rather than hats) settles it: 163
scores 1.000 and 81 still 0.542.

The five-cut alignment metric that settled the previous track is *not* reliable
enough to choose between them. On this track it scores 79 BPM at 3.09 and 80 BPM
at 0.34 — a one-BPM difference producing a tenfold gap, which is not a real
signal. Where the two methods disagree this strongly, trust the autocorrelation:
it uses every onset, while five cut points is a sample too small to discriminate.
See "Picking the tempo" above.

### Short tracks still work

This one is 33.7s against a 31.3s cut, so the bed is taken straight through and
nothing is looped. `loop_to()` remains for the opposite case: a bed shorter
than the cut is repeated with a crossfaded seam, since music that stops while the
picture is still running is worse than a seam.

If you use it, crossfade the **end** of the cycle so it meets the start of the
next one. Crossfading the head leaves the joins between repeats as raw
`src[-1] -> src[0]` — the discontinuity the crossfade exists to remove — and it
still measures clean if you sample in the wrong place, which is how the first
version of this passed. A DC test catches it: a buffer that is 1.0 for the first
half and 0.0 for the second must ramp across the seam, and it went from a step of
1.000 to 0.000 once the blend moved.

### The synthesised fallback

`scripts/make-promo-music.py` still generates a bed from scratch and embeds no
third-party audio, so it carries no attribution obligation. It is **not what
ships** — the Treblo track above is — but it is the fallback when no licensed track
is available.

Two things to know before using it, both of which have bitten a draft here:

It runs at a **fixed 88 BPM** and has no `--bpm` flag. Pass `--bpm 88` to the
compositor so the cut is snapped to its grid; without it the edit is unsynced.

Its `--out` default is `/tmp/music.wav` while the compositor's `--music` default
is empty, so the two-command workflow needs both paths stated explicitly:

```bash
python3 scripts/make-promo-music.py -o /tmp/opencode/synth.wav -d 40
python3 scripts/make-promo-video.py --music /tmp/opencode/synth.wav --bpm 88 -o ...
```

`--seed` genuinely varies the output — it reaches the three noise voices. That
was not always true, and an inert flag is worse than none.

## Copy in the video

The end card reads **"Other AI tutor bots start at $4 per month."** That is the
category anchor from `POSTS.md`, kept consistent on purpose. Re-verify the figure
before every campaign — see `POSTS.md` § "On the price anchor".

No competitor is named anywhere in the video or the copy.
