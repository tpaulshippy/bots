# Syft Learning 1.0.6 — marketing rollout

Written 2026-09-30. The release reached users earlier in September, so this is a
"what's new" push rather than a launch-day push.
Copy is in [`POSTS.md`](POSTS.md). Images are in [`assets/`](assets/), the video in
[`video/`](video/).

---

## 1. The positioning, and what it replaces

Three propositions carry everything. Every post, card, and video scene maps to one
of them.

| # | Proposition | Proof on screen |
|---|---|---|
| 1 | **Educational.** Your student learns *from* and *about* AI. | Spaced-repetition flashcards; study pages the tutor builds and keeps |
| 2 | **Parents observe and customise.** | Full transcripts; notification controls; the system prompt you write |
| 3 | **Low priced.** | Free to start; $1/mo or $5/mo for more |

**Proposition 1 leads.** Flashcards and study materials are the product. Chat is
how you get to them, not the thing itself.

**Proposition 2 is the wedge.** Most AI-for-kids products are a black box to the
parent. This one shows you every conversation, tells you when to look, and lets you
write the persona. The honest version is stronger than the vague one: you control
the character, and the safety layer is not removable — the editor says so on screen.

**Proposition 3 is the close.** Concrete, checkable, and cheaper than the category.

### What we stopped leading with

These were in earlier drafts of this plan. They are cut, on purpose:

- **"The tutor asks questions back."** It sells the AI's behaviour rather than the
  learning. A parent does not buy Socratic questioning; they buy the outcome.
- **Streaks.** A retention mechanic for the child's app, not a reason for a parent
  to buy. It also implies the child's engagement is the product.
- **One bot per subject.** A feature detail. "A tutor for every subject" makes the
  product sound like a catalogue.

They are all still true and still in the app. None of them is the pitch.

### The two mistakes already made, so we do not repeat them

- **Don't make your audience take a second hop.** Post the App Store link natively.
  `personal post → brand post → App Store` loses most of the value. Cross-post to
  the brand account as a parallel act, not a funnel step.
- **Don't name a competitor.** Anchor on the category instead — see
  `POSTS.md` § "On the price anchor".

---

## 2. Pre-flight — before you post anything

- [ ] **Check the marketing template's plan allowances.** Fixed in this branch, but
      confirm it still matches `front/constants/subscriptions.ts` — the two drifted
      by ~10× and misnamed the top tier. That duplication is the root cause and is
      still there.
- [ ] **Do not use `docs/app-store/1.0.6/screenshots/11-activity.png`.** Stale: it
      predates `ca7b49b` ("activity card rows showing gray in light mode") and still
      shows that bug. Never uploaded to the store, so nothing is broken in
      production — but it must not be used in a post or a future store upload until
      it is re-captured. The captures under `screenshots-web/` are current.
- [ ] **Confirm App Store Connect → 1.0.6 → What's New is populated** from
      `docs/app-store/1.0.6/WHAT_IS_NEW.md`.
- [ ] **Build the attributed links** (§6). Ten minutes now, otherwise you cannot
      tell which post did anything.

---

## 3. Timing

**Total spend: about 3 hours, 6 posts, 1 video upload.**

Six posts, not five: `POSTS.md` defines A1–A5 and B1–B3, of which A4 and A5 are
the same video on two platforms. That is 6 feed posts (A1–A3, B1–B3) and 1
uploaded video shared across Reels and YouTube.

| Day | Date | Proposition | Where | Asset |
|---|---|---|---|---|
| Thu | Oct 1 | 1 + 3 — educational, priced | Personal FB, IG, Threads | `parent-flashcards.png` |
| Thu | Oct 1 | 2 — parent control | Personal LinkedIn | `parent-control.png` |
| Thu | Oct 1 | 2 — parent control | Personal X + Bluesky | `og-x-bluesky.png` |
| Fri | Oct 2 | Mirror of Oct 1 | `@syftlearning` FB, IG, Threads | matching |
| Sat | Oct 3 | The video, vertical | Personal IG Reels + FB Reels | `video/syft-promo-9x16.mp4` |
| Sat | Oct 3 | The video as a YouTube Short | Syft Learning YouTube | `video/syft-promo-9x16.mp4` (vertical — see POSTS.md A5) |
| Wed | Oct 7 | 2 — the system prompt | Personal FB, IG | `parent-control.png` |
| Wed | Oct 7 | 1 — study materials | Personal LinkedIn, X | `parent-materials.png` |
| Thu | Oct 8 | Mirror | `@syftlearning` (all) | matching |
| Sat | Oct 17 | 3 — price, plainly | Personal FB, IG | `parent-flashcards.png` |

Each proposition gets exactly one post plus the video. Three posts total per
audience; more and your personal feed starts treating you as a marketing account.

### When to post

- **LinkedIn** — Tue/Wed/Thu, 8:00–9:30am. Friday and weekends are dead there.
- **Facebook** — 7–9pm weekdays, or 9–11am Saturday.
- **Instagram** — 11am–1pm or 7–9pm.
- **X / Bluesky** — late morning, weekday; tie to whatever is being discussed.
- **Threads** — cross-post the Instagram caption. Do not write a separate one.

---

## 4. Platform notes

**Facebook** — where the parent audience actually is, and the only one of these
where plain text with a real opinion still beats a designed card. Parent groups you
genuinely belong to: fine. Drive-by promo drops: they get you removed from the exact
audience you want.

**Instagram** — the video is the entire play. Organic reach on a static post from a
small account is close to zero, so spend the time on the Reel, not a carousel.

**LinkedIn** — two rules that matter: **put the link in the first comment, not the
body** (a body link measurably suppresses reach), and open with a specific claim
rather than a heading. No "excited to announce". This is also where saying "I built
this" is interesting rather than annoying.

**X** — low ceiling, near-zero cost. Post as a 3-post thread; a standalone link post
gets no impressions. Mostly existing followers and search.

**Bluesky** — near-zero reach, but a chunk of the indie/dev audience is there and it
costs one paste.

**Threads** — the Instagram caption, verbatim.

**YouTube** — the one platform where the *archive* beats the post. Upload the 16:9
cut as a Short. Three things differ and they decide whether it does anything:

- **Description links do not convert.** The CTA has to be on screen, which is why
  that cut is rendered with `syftlearning.app` burned into the end card
  (`--end-url`). Pin the App Store link as the top comment.
- **Do not tick "Made for Kids."** It means the content is *primarily directed at*
  under-13s. This is a video *about* the product for parents. It is also the
  commercially correct answer — ticking it disables comments, notifications and
  personalised analytics. See §7.
- **Title and description are search surface.** "free AI tutor for kids" is a real
  query. This upload can still surface in a year.

**Do not start a long-form channel for this.** One 31-second upload, no playlists, no
thumbnails to maintain. A kids-app channel that goes quiet is worse than no channel.

**`@syftlearning` (all seven)** — same content, posted in parallel. Seven brand
surfaces: FB, IG, Threads, LinkedIn, X, Bluesky, YouTube. Expect almost no
reach. Its job is the permanent record and search indexing.

---

## 5. Imaging strategy

Full rationale and regeneration in [`assets/README.md`](assets/README.md); the video
in [`video/README.md`](video/README.md).

- **Source of truth is `screenshots-web/`**, captured from the real app with
  Playwright. Demo data only (profiles "Maya", "Jordan", "Sam"), which is what makes
  it safe to publish. Do not re-shoot.
- **Three static cards, one per proposition**: `parent-flashcards` (learning),
  `parent-materials` (learning, second angle), `parent-control` (parent control).
  The wide link cards and the reel cover carry the same messages.
- **One template, brand-locked** to `#0a7ea4` / `#00a4c9` from `front/app.json`.
  Wordmark top-left, one headline, one sub-line.
- **The video is the highest-value asset here.** It is built from real screen
  recordings — a flashcard flips to reveal the answer and the rating row, the
  notification toggles are on screen, the system prompt is editable. It holds
  attention in a way a slideshow cannot.
- **Never publish a capture containing a real child's conversation.** The current set
  is demo data and must stay that way. If you ever capture from a real family, get
  written consent first and blur the names.

---

## 6. Measurement

Append campaign tokens to the App Store link so App Store Connect attributes
installs:

```
?pt=facebook&ct=oct1_parent_ig&mt=8
```

`pt` is the **provider token** from App Store Connect's Analytics configuration, not
the social network's name — use the exact value Apple assigns. `ct` is where you
record *which* post, e.g. `ct=oct1_parent_ig`. `mt=8` is the iOS marketing template.
A distinct `ct` per post lets you read the numbers separately in
**App Store Connect → App Analytics → Sources**.

In order of usefulness:

1. **Product Page Views → Downloads conversion**, per source. A high
   page-view/low-download ratio means the post over-promised or the store page does
   not match it.
2. **Downloads, days 0–7** against your trailing baseline. There isn't one yet, so
   this campaign establishes it. Save the number.
3. **Per-`ct` breakdown.** Expect Facebook and Instagram to carry installs and
   LinkedIn to carry credibility. LinkedIn may produce almost no installs and still
   be the most valuable post you wrote.

**Set expectations honestly.** A few hundred installs from a personal network is a
good result. This is a version-update push, not a launch, and the accounts are
small. The realistic return is some installs, one or two people worth talking to, and
a reusable asset set. For materially more you need paid parent-targeted promotion
(§7) or a real launch, not a better post.

---

## 7. Compliance — read this once, it is not optional

Syft Learning is a Kids Category app, age rating 4+, with server-side safety filters
and crisis detection.

- **Market to parents. Never to children.** Every asset and sentence here is
  parent-directed. No child models or faces, no "kids, download this", no art
  direction that reads as child-directed. This is both an Apple Kids Category
  expectation and a COPPA posture, and it is the line you do not cross.
- **If you ever run paid ads, target parents — explicitly.** Do not target or
  interest-target under-13s. Meta and Google will reject a kids-directed ad for a
  kids app, and you would be building the wrong audience.
- **YouTube "Made for Kids" is a COPPA question, not a marketing one.** The flag
  means content *primarily directed at* under-13s. Every video here is aimed at
  parents, so it stays unticked — which is also better for reach. If you ever publish
  something a child is meant to watch, the answer flips: tick it, accept the lost
  features, and stop ad-targeting that video.
- **Keep the kids path free of third-party trackers.** Apple requires no third-party
  analytics or ad SDKs in a Kids Category app. Keep the web app
  (`syftlearning.app/app`) consistent.
- **Comparative claims: prices are fine, safety is not, and never by name.** A price
  comparison is verifiable and is proposition 3. Use it as a *category* anchor —
  "Other AI tutor bots start at $4 per month" — never as a named comparison. Naming
  one hands them your distribution, makes your pricing a reaction rather than a
  position, and creates a public claim you must keep true after they change price.
  "Safer than ChatGPT for kids" is not substantiable at all; use the factual
  description instead. Re-verify the $4 anchor before each campaign.
- **Only claim what is in 1.0.6.** LaTeX/math typesetting is in scope: it merged to
  `main` after the binary build, but it is pure JavaScript and EAS Update is enabled
  on the production channel, so it reached users over the air. `WHAT_IS_NEW.md`
  already advertises it.
- **When you talk about parent control, be exact.** The parent chooses the
  notification level — instant on new chat, per message, or a daily digest
  instead, plus study reminders when cards are due. Study reminders are their own
  per-device toggle, not a fourth mutually exclusive mode: the switch is disabled
  while digest-only is on. Do not claim it always notifies; it is a setting, and
  that is a better story. Likewise: the parent writes the system prompt, and the editor states
  on screen that baseline safety cannot be removed by it. Both halves of that sentence
  are true and saying them builds trust.

---

## 8. If it flops

It probably will, on raw numbers, and that is expected — see §6. Two responses, in
order:

1. **Do not boost it.** Paying to promote a post to your own followers is a bad trade
   at this audience size and will not produce a durable gain.
2. **Reuse the assets.** The images, the video and the copy are not tied to this
   version. Next release, drop new captures in, re-run the two scripts, re-date the
   calendar.

The highest-leverage thing in this document is not a post. It is that the App Store
product page has screenshots, a populated What's New, and a price matching the app.
Every post is a doorway to that page.
