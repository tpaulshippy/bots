# Copy — Syft Learning 1.0.6

Copy-paste ready. Links are marked `⟪LINK⟫` — replace with the attributed App Store
URL from `ROLLOUT.md` §6. Do not post before reading `ROLLOUT.md` §2 (pre-flight) and
§7 (compliance).

Base URL: `https://apps.apple.com/us/app/syft-learning/id6742674793`
With a campaign token: append `?pt=facebook&ct=oct1_parent&mt=8` (and so on per post).

Prices used here: **Free / Basic $1/mo / Plus $5/mo** — matching
`front/constants/subscriptions.ts`. Copy says "free, or $1/mo" rather than "under
$4", because the $5 Plus tier exists and an unqualified "under $4" reads as though
every paid option is below it.

### On the Khanmigo comparison

Khanmigo is **$4/mo** (verified Sep 2026, multiple sources including their own
pricing page). That is a checkable fact, so it is fair game in public copy — and it
is the single sharpest line you have. Two rules:

- **Do not compare per-child.** One Khanmigo subscription covers up to 10 children.
  If you push a "cheaper per kid" angle, a parent with three kids will do that
  division in their head and you lose. Stay on the flat monthly number.
- **Re-verify before each campaign.** Competitor pricing moves. If Khanmigo changes,
  every post in this deck needs a pass before it goes out.

---

## Track A — parents

### A1 · Thu Oct 1 · Facebook + Instagram + Threads

**Image:** `parent-fractions.png`

> The best moment in my tutoring app last week wasn't the answer. It was the question
> back.
>
> My kid asked why a fraction is half of something. The tutor didn't hand her 1/2 —
> it asked what she already thought. She said "one piece out of two pieces." The
> tutor said "exactly" and asked her to take it one step further.
>
> That's the whole reason I built Syft Learning. An app that finishes the homework
> teaches nothing. One that gets your kid to *say the reasoning out loud* teaches
> something.
>
> Version 1.0.6 just went live on the App Store. Free to start — Khanmigo is
> $4/month. ⟪LINK⟫

*Threads/IG caption: same text, trimmed to the first paragraph plus the last line.*

---

### A2 · Wed Oct 7 · Facebook + Instagram

**Image:** `parent-streaks.png`

> I gave my kid a maths flashcard deck and watched her quit on day two.
>
> So I rebuilt the deck system in 1.0.6: cards now get scheduled with spaced
> repetition, she rates each one Again / Hard / Good / Easy, and the app decides what
> she sees next and when. Cards she's solid on stop showing up. Cards she keeps
> missing come back tomorrow.
>
> There's a streak and a stats screen now. She's on day four and has not asked to
> skip it once.
>
> Free to start, $1/mo if you want the bigger allowance. Khanmigo is $4/month. ⟪LINK⟫

---

### A3 · Sat Oct 17 · Facebook + Instagram

**Image:** `parent-bots.png`

> The question I get most about Syft Learning is "which bot do I even pick?"
>
> So: give them a few. Math, science, writing, a story buddy. Each one has its own
> colour, icon and personality, and your kid picks who they want to talk to.
>
> Turns out the tutor they choose is the one they'll actually open.
>
> Free to start. ⟪LINK⟫

---

### A4 · Sat Oct 3 · 20-second Reel (IG + FB)

**Cover:** `reel-cover.png`

Shot list, no voiceover, captions burned in:

| Sec | Screen | Caption on screen |
|---|---|---|
| 0–3 | Chat, empty input | "She: help me with fractions" |
| 3–7 | Her message sent | "One piece out of two pieces?" |
| 7–13 | Tutor replying, streaming | "Exactly. What if I cut it in half?" |
| 13–17 | Flashcards, deck list | "Cards that come back when she'll forget them" |
| 17–20 | Stats, streak | "Free to start" |

**Caption:**

> Twenty seconds of what it actually looks like. ⟪LINK⟫

---

## Track B — builders

### B1 · Thu Oct 1 · LinkedIn

**Image:** `builder-1.png` · **Link goes in the first comment, not the body.**

> Version 1.0.6 of Syft Learning is live on the App Store.
>
> It's an AI tutor app for kids that I built because the alternatives were either
> $20/month or a black box. Three things went out in this release:
>
> — Spaced repetition on the flashcard decks (Again / Hard / Good / Easy, due-date
>   scheduling), with streaks and a stats dashboard on top
> — A Study Materials library — the tutor builds interactive web pages your kid can
>   come back to
> — A parent Activity inbox with full conversation transcripts and safety events
>
> Free tier, $1/mo and $5/mo tiers, RevenueCat on the paywall. Free to start: ⟨LINK⟩
>
> What's the next thing you'd want in it?

*First comment:* the link.

---

### B2 · Thu Oct 1 · X (thread) + Bluesky (single post)

**Image:** `og-x-bluesky.png`

X, 3 posts:

> 1/ Version 1.0.6 of Syft Learning is live — an AI tutor app for kids. $0 to start.
>
> 2/ The headline feature: spaced repetition on the flashcard decks. Again / Hard /
> Good / Easy, due-date scheduling, streaks, a stats dashboard.
>
> 3/ Also new: tutor-built study pages, a parent Activity inbox with full
> transcripts, and streaming replies with a Stop button. ⟨LINK⟩

Bluesky, single post (300 char limit):

> Syft Learning 1.0.6 is live on the App Store. Spaced-repetition flashcards, streaks, a stats view, tutor-built study pages, and a parent inbox with every transcript. $0 to start. ⟨LINK⟩

---

### B3 · Thu Oct 8 · LinkedIn + X

**Image:** `og-x-bluesky.png` · **Link in the LinkedIn first comment.**

> The most requested thing in 1.0.6 wasn't a feature. It was "my kid closes the app
> after two days."
>
> Flashcards are now scheduled with spaced repetition. She rates each card Again /
> Hard / Good / Easy, and the app decides what she sees next and when. Cards she's
> solid on stop coming back. Cards she keeps missing come back tomorrow.
>
> Streaks and a stats screen sit on top of it. Day four, and she hasn't asked to
> skip it once.
>
> Implementation notes if you're building something similar: the whole scheduling
> decision is a single query — due date, last rating, interval — and it's fast at
> this scale, but the rating vocabulary is the product. Hard/Good/Easy without Again
> is a checkbox. Again is what makes it a memory tool.
>
> ⟨LINK⟩

---

## Mirroring to `@syftlearning`

Post the same images and the same text, verbatim, on the brand accounts — with one
edit: swap the first-person framing for third person, and drop any "I built this"
language, which reads oddly from the brand account.

> Version 1.0.6 of Syft Learning is live on the App Store. Spaced-repetition
> flashcards, streaks, a stats dashboard, tutor-built study pages, and a parent
> Activity inbox with full transcripts. Free to start. ⟨LINK⟩

Mirroring is an archive and SEO play, not a reach play. Do it the same day, spend
five minutes, and do not check the analytics.
