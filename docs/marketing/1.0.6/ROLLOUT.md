# Syft Learning 1.0.6 — marketing rollout

Written 2026-09-30. The release reached users earlier in September, so this is a
"what's new" push rather than a launch-day push.
Source material: [`docs/app-store/1.0.6/WHAT_IS_NEW.md`](../../app-store/1.0.6/WHAT_IS_NEW.md).
Copy is in [`POSTS.md`](POSTS.md). Images are in [`assets/`](assets/).

---

## 1. The strategy, in four lines

1. **Nobody follows you for a version number.** "1.0.6 is out" is not a hook. Lead
   with an outcome — a parent seeing their kid *ask back* instead of copy answers —
   and let the version number be a footnote.
2. **Your personal accounts distribute; the brand account archives.** The
   `@syftlearning` accounts have almost no followers. They are the durable record
   and the credibility layer, not the reach. All the reach is in the personal
   accounts.
3. **Never make your audience take a second hop.** Post the App Store link natively
   in the personal post. `personal post → brand post → App Store` loses most of the
   value. Cross-post to the brand account *as a parallel act*, not as a funnel step.
4. **Two tracks, two audiences, two different posts.** Parents and builders care
   about completely different things. One post cannot do both.

| | Track A — parents | Track B — builders |
|---|---|---|
| Audience | Parents of school-age kids | Indie hackers, iOS/Android devs, fellow parents-who-build |
| Primary fear | "Is this safe? Will it just do the homework?" | "What stack? How did you ship it? Is it worth my time?" |
| Lead with | Trust + it actually teaches | The build + what's in the box |
| Proof | Screenshot of a real conversation | Feature list, no adjectives |
| Channels | Facebook, Instagram, Threads | LinkedIn, X, Bluesky |
| CTA | App Store link | App Store link |

---

## 2. Pre-flight — do these before you post anything

Cheap, and each one prevents a real problem.

- [ ] **Do not use `docs/app-store/1.0.6/screenshots/11-activity.png`.** It is stale:
      it was captured before `ca7b49b` ("activity card rows showing gray in light mode")
      and still shows the gray-row bug that the shipped app does not have. It was
      never uploaded to the App Store, so nothing is broken live — but do not use
      it in a social post or a future store upload until it is re-captured. Every
      other screenshot in the set is clean. See `assets/README.md`.
- [ ] **Fix the marketing page's plan numbers.** `front/constants/subscriptions.ts`
      says Free (~3K tokens/day), Basic **$1/mo** (~312K tokens/day) and **Plus**
      **$5/mo** (~1.67M tokens/day). `back/bots/templates/marketing.html` says
      Free 2,000 words, Basic 20,000 words and **Pro** $5/mo. The Free tier roughly
      matches, but Basic and Plus are understated by roughly 10× and the top tier is
      misnamed ("Pro" vs "Plus"). Every post in this plan links to the **App Store
      listing**, not here — but this is the public web page a parent lands on from
      search and from the in-app web link, so the same correction has to land here
      or the two contradict each other. Fix the template.
- [ ] **Qualify the "under $4" line, do not delete it.** `README.md` and
      `docs/app-store/1.0.6/REVIEW_NOTES.md` both say *"less than $4 a month"*. That
      is accurate for the tiers it describes — Free and Basic $1/mo — and it is the
      sharpest competitive point you have, because the closest comparable product
      charges $4/mo flat. Keep it, but write *"free, or $1/mo"* rather than "under
      $4": a parent reading an unqualified "under $4" may reasonably assume the $5
      Plus tier is also under $4. All copy in this plan avoids that ambiguity.
- [ ] **Check what the live listing actually shows.** You did not upload the
      in-repo screenshot set, so the store page is running something else. Open it
      on a phone and confirm the screenshots, the price, and the icon match what
      you're about to post. Inconsistency between a post and the store page is the
      fastest way to kill a click.
- [ ] **Confirm App Store Connect → Version 1.0.6 → What's New is populated** from
      `WHAT_IS_NEW.md`. That field is the reason a version update gets surfaced to
      existing users at all, and it is the thing your posts point at.
- [ ] **Build the attribution links** (see §6). Ten minutes now, and otherwise you
      cannot tell which post did anything.

---

## 3. Timing

The release is already a couple of weeks old, so this is **not** a launch-day push.
That is fine — "here's what I just added" outperforms "I just launched" for anyone
who already knows you, and it has a longer shelf life. Do not manufacture urgency.

**Total spend: about 3 hours, 6 posts, 1 short video.** Small enough to actually finish.

| Day | Date | What | Where | Asset |
|---|---|---|---|---|
| Thu | Oct 1 | Track A launch — the fractions story | Personal FB, IG, Threads | `parent-fractions.png` |
| Thu | Oct 1 | Track B — what shipped and what's in it | Personal LinkedIn, X, Bluesky | `builder-1.png` |
| Fri | Oct 2 | Same Track A post, mirrored | `@syftlearning` FB, IG, Threads | `parent-fractions.png` |
| Sat | Oct 3 | 20-second short: screen recording of one tutoring exchange | Personal IG Reels + FB Reels | `reel-cover.png` |
| Wed | Oct 7 | Track A, second angle — streaks and retention | Personal FB, IG | `parent-streaks.png` |
| Thu | Oct 8 | Track B, deep dive on one feature (spaced repetition) | Personal LinkedIn, X | `og-x-bluesky.png` |
| Fri | Oct 9 | Same posts, mirrored | `@syftlearning` (all) | matching assets |
| Sat | Oct 17 | Track A, third and final angle — tutor per subject | Personal FB, IG | `parent-bots.png` |
| — | optional | Track A, extra angle — maths typesetting (A4) | Personal FB, IG | `parent-fractions.png` |

The optional row is genuinely optional — post it only if the campaign has energy
left after the eight scheduled ones. It is the strongest single-feature proof point
you have, because a parent can see the before and after in one screenshot.

Then stop. Do not post again for a month. Three parent angles is the ceiling before
your personal feed starts treating you as a marketing account.

### When to post

- **LinkedIn** — Tue/Wed/Thu, 8:00–9:30am your time. Friday and weekends are dead there.
- **Facebook** — 7–9pm weekdays, or 9–11am Saturday. Parents scroll on a sofa.
- **Instagram** — 11am–1pm or 7–9pm. The Reel can go any time; the algorithm is not fussy.
- **X / Bluesky** — late morning, weekday. Tie to whatever is being discussed that day
  if you can; a standalone product post does much worse.
- **Threads** — cross-post from the Instagram caption. Do not write a separate one.

---

## 4. Platform notes

**Facebook** — where the parent audience actually is, and the only one of these where
a plain-text post with a real opinion still reliably outperforms a designed card.
Post in a conversational register. Consider parent groups you genuinely belong to
(no drive-by promo drops — that gets you removed and it is the fastest way to make
enemies of the exact audience you want).

**Instagram** — the Reel is the entire play here; the static card is a supporting
asset. Organic reach on a static post from a small account is close to zero, so
spend the 20 minutes on the video, not on the carousel.

**LinkedIn** — your best builder audience and the one most likely to produce
genuine peer engagement. Two rules that matter: **put the link in the first
comment, not the body** (a body link measurably suppresses reach), and open with a
specific claim rather than a heading. No "Excited to announce" — lead with the thing
itself. This is also the one platform where saying "I built this" is interesting
rather than annoying.

**X** — low ceiling, but near-zero marginal cost. Post the builder angle as a
2–4 post thread; the standalone link post will get no impressions. Mostly this is
about existing followers and search, not discovery.

**Bluesky** — near-zero reach, but it is where a chunk of indie/dev people you
actually want to reach are, and it costs one paste. Feeds, not threads.

**Threads** — literally the same caption as Instagram. 60 seconds of effort.

**`@syftlearning` (all six)** — post the same content. Expect almost no reach and do
not judge the campaign on it. Its job is to be the permanent record that a follower
who lands on you can scroll back to, and to be indexed.

---

## 5. Imaging strategy

Full rationale and regeneration instructions in [`assets/README.md`]. The short version:

- **Source of truth is the App Store screenshot set** already in the repo. It was
  captured against seeded demo data (profiles "Maya", "Jordan", "Sam") — no real
  children, which is exactly why it is safe to publish. Do not re-shoot.
- **Three parent angles, one per post**, each on a different screen so the campaign
  does not look like one idea repeated: `05-chat` (teaching), `09-stats` (retention),
  `03-select-bot` (choice).
- **One template, brand-locked.** `#0a7ea4` → `#052f42` gradient, `#00a4c9` accent,
  taken from `front/app.json`. Wordmark top-left, one headline, one sub-line. Same
  shape everywhere so the three posts read as a set.
- **The video is the highest-value asset in the whole plan.** A 32-second cut is
  already rendered in [`video/`](video/) in both 9:16 and 16:9, and it will
  out-reach the six static posts combined. Post it rather than re-shooting one on a
  Sunday. If you want a human-in-the-loop version instead, the shot list below is
  the fallback.
- **Never publish a screenshot containing a real child's conversation.** The current
  set is demo data. If you ever capture from a real family, get written consent
  first and blur the names.

---

## 6. Measurement

Add campaign tokens to the App Store link so App Store Connect attributes installs.
Append them to the app URL:

```
?pt=facebook&ct=oct1_parent_ig&mt=8
```

`pt` is the **provider token** from App Store Connect → the app's Analytics
configuration, not the social network's name — use the exact value Apple assigns
(`facebook`, `instagram`, `linkedin`, `x`, `bluesky`, … as listed there). `ct` is
where you record *which* post, e.g. `ct=oct1_parent_ig`, and `mt=8` is the iOS
marketing template. Use a distinct `ct` per post so you can read the numbers
separately in **App Store Connect → App Analytics → Sources**.

What to actually look at, in order:

1. **Product Page Views → Downloads conversion**, per source. This is the real
   health check. A high page-view/low-download ratio means the post over-promised
   or the store page does not match it.
2. **Downloads, days 0–7 vs. your trailing baseline.** There is no baseline yet, so
   the first honest baseline is this campaign. Save the number; the next release
   compares against it.
3. **Per-`ct` breakdown.** Expect Facebook and Instagram to do the work on installs
   and LinkedIn to do the work on credibility. LinkedIn may produce almost no
   installs and still be the highest-value post you wrote.

### Set expectations honestly

A few hundred installs from a personal network is a good result. This is a
version-update post, not a launch, and your accounts are small. The realistic return
is: some installs, one or two people you can actually talk to about the product, and
a reusable asset set for next time. If you want materially more than that, the next
lever is a paid parent-targeted campaign (§7) or a real launch, not a better tweet.

---

## 7. Compliance — read this once, it is not optional

Syft Learning is a Kids Category app, age rating 4+, with server-side safety filters
and crisis detection. That shapes what you are allowed to say.

- **Market to parents. Never to children.** Every asset and every sentence here is
  parent-directed. No child models or faces, no "kids, download this", no art
  direction that reads as child-directed. This is both an Apple Kids Category
  expectation and a COPPA posture, and it is the line you do not cross.
- **If you ever run paid ads, target parents — explicitly.** Do not target or
  interest-target under-13s. Meta and Google will reject a kids-directed ad for a
  kids app, and you would also be building the wrong audience. The organic plan
  above needs none of this.
- **Keep the kids path free of third-party trackers.** Apple requires no
  third-party analytics or ad SDKs in the Kids Category app. Keep the web app
  (`syftlearning.app/app`) consistent — do not bolt an analytics tag onto the
  student-facing route.
- **Comparative claims: prices are fine, safety is not — but never name them.** A
  price comparison is verifiable and it is your sharpest line, because the closest
  comparable product is $4/mo and you are free or $1/mo. Use it as a *category*
  anchor — "Other AI tutor bots start at $4 per month" — not as a named comparison.
  Naming a competitor hands them free distribution, makes your pricing a reaction
  rather than a position, and creates a public claim you must keep true after they
  change their price. "Safer than ChatGPT for kids" is a claim you cannot
  substantiate at all; use the factual description instead ("server-side safety
  filters, crisis detection, and a full transcript you can read"). Re-verify the $4
  anchor before each campaign — category pricing moves.
- **Only claim what is in 1.0.6.** LaTeX/math typesetting is in scope and worth
  posting about: it merged to `main` after the App Store binary build, but it is
  pure JavaScript and the app has EAS Update enabled on the production channel
  (`checkAutomatically: "ON_LOAD"`), so it reached users over the air without a new
  build. `WHAT_IS_NEW.md` already advertises it on the store page, so the posts and
  the listing agree. Anything genuinely unshipped, leave out.
- **Prices in public copy must match the app.** Free / $1 / $5. See §2.

---

## 8. If it flops

It probably will, on raw numbers, and that is the expected outcome — see §6. Two
responses, in order:

1. **Do not boost it.** Paying to promote a post to your own followers is a bad
   trade at this audience size, and it will not produce a durable gain.
2. **Reuse the assets.** The images and the copy are not version-specific in the way
   the post is. The next time you ship something, drop the new screenshots into the
   same template (`./scripts/make-marketing-assets.sh`) and re-run this plan with
   new dates.

The single highest-leverage thing in this whole document is not a post. It is that
the App Store product page now has screenshots, a populated What's New, and a price
that matches the app. Every post here is a doorway to that page. If you only do one
thing, make it that.
