# App Review Notes — Syft Learning 1.0.6

Copy-paste (and adapt) into App Store Connect → App Review Information → Notes.

---

Syft Learning lets parents give their kids safe, affordable access to
customizable AI tutors.

SIGN-IN
- Tap "Continue with Apple" or "Continue with Google" on the login screen.
- Demo account for review: [TODO — fill in a demo parent account email.
  Sign-in is OAuth (Apple/Google), so please provision a demo Apple ID or
  Google account and share it here, or contact us at [TODO support email]
  and we will grant access.]
- After first sign-in, the 5-step onboarding wizard creates a student
  profile and a first bot automatically.

WHAT TO TRY
- Chat: pick a student profile, choose a bot, and send a message. Replies
  stream live; the tutor can create flashcard decks, build study web pages,
  or search the web (parent-configurable per bot).
- Flashcards: open Flashcards, study a deck with Again/Hard/Good/Easy
  ratings driven by spaced repetition.
- Study Materials: open the drawer → Study Materials to revisit tutor-built
  interactive pages.
- Stats: open the drawer → Stats for streaks and activity.
- Parent controls (drawer → Settings, PIN-gated if a PIN is set): manage
  profiles, bots, safety settings, notifications, and subscription. The
  Activity inbox shows conversation transcripts and safety events.

SUBSCRIPTIONS
- The app offers an auto-renewable subscription via RevenueCat
  (monthly, under $4). All parent features work in a free trial mode;
  upgrading prompts the standard Apple pay sheet. Subscriptions can be
  restored from the Subscription screen.

SAFETY / KIDS CATEGORY
- All bot output passes through server-side safety filters with crisis
  detection; parents can further restrict web search, image input, and
  page building per bot, and can review full transcripts in Activity.
- The app contains no third-party advertising, no outbound links except
  tutor-cited sources (shown behind a confirmation dialog), and no
  user-to-user communication.

EXPORT COMPLIANCE
- Uses only standard OS HTTPS networking (no non-exempt encryption):
  ITSAppUsesNonExemptEncryption = false.
