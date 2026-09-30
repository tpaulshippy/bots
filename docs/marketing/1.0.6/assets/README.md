# Marketing assets — 1.0.6

Generated. Do not hand-edit these; edit the script and re-run it.

```bash
./scripts/make-marketing-assets.sh
```

Requires ImageMagick 6 (`convert`) and the DejaVu Sans fonts. Output lands in this
directory. The script is deterministic — same inputs, same bytes — so it is safe to
re-run any time, including after new screenshots are captured.

## The set

| File | Size | Use | Source screen |
|---|---|---|---|
| `parent-fractions.png` | 1080×1350 | IG/FB feed, Threads. Post A1 | `05-chat` |
| `parent-streaks.png` | 1080×1350 | IG/FB feed. Post A2 | `09-stats` |
| `parent-bots.png` | 1080×1350 | IG/FB feed. Post A3 | `03-select-bot` |
| `og-x-bluesky.png` | 1600×900 | X, Bluesky, LinkedIn link cards | all three, fanned |
| `og-facebook.png` | 1200×630 | Facebook link previews | all three, fanned |
| `reel-cover.png` | 1080×1920 | IG/FB Reel cover. Post A4 | `05-chat` |
| `builder-1.png` | 1200×1200 | LinkedIn / X square. Post B1 | `05-chat` |

Sizing follows current platform specs: 4:5 for feed posts (largest screen area
before the fold), 16:9 for link cards, 9:16 for vertical video.

## Design

One template so the three parent posts read as a set.

- Background: `#0a7ea4` → `#052f42` vertical gradient
- Accent / wordmark: `#00a4c9`, taken from `front/constants/Colors.ts`
  (`tintColorLight`) and `back/bots/templates/marketing.html`
- `#0a7ea4` is the app's splash-screen and adaptive-icon background, from
  `front/app.json`
- `#052f42` (gradient end) and `#dff2fa` (muted body text) are **asset-specific** —
  they are not defined in the app or the site. They are chosen here for contrast
  against the `#0a7ea4` top of the gradient.
- Wordmark top-left, one headline (52pt bold), one sub-line (30pt)
- Screenshots sit in a rounded-corner frame with a hairline border, in the source
  app's own light theme — no restyling of the UI

Every colour is taken from `front/app.json`, `front/constants/Colors.ts` and
`back/bots/templates/marketing.html`, except the two marked above as
asset-specific. If the brand tint changes in the app, change `BRAND`/`ACCENT` at the
top of the script and re-run.

## Regenerating after the next release

Drop the new captures into `docs/app-store/1.0.6/screenshots/` (or bump the path in
the script) and re-run. The three parent angles are deliberately bound to three
*different* screens so the campaign does not read as one idea repeated — when you
re-cut them, pick a new trio.

## ⚠️ Do not use `11-activity.png`

`docs/app-store/1.0.6/screenshots/11-activity.png` is **stale**. It was captured
before `ca7b49b` ("fix(activity card rows showing gray in light mode)", 2026-09-14)
and still shows the gray transcript-row bug that the shipped app does not have.

It was never uploaded to the App Store, so nothing is wrong in production. But it
must not be used in a social post or a future store upload until it is re-captured
using the recipe in `docs/app-store/1.0.6/screenshots/README.md`.

Every other screenshot in the set has been checked and is clean. None of the images
here use `11-activity`.

## Privacy

The source screenshots were captured against a locally seeded backend with demo data
only — the student profiles are "Maya", "Jordan" and "Sam", and no real child, real
conversation or production account appears in any of them. That is what makes this set
safe to publish, and it must stay that way. Do not swap in a capture from a real
family without written consent, and blur names if you ever do.
