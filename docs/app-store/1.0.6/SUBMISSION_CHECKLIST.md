# Submission Checklist — Syft Learning 1.0.6

## Build (done — see links)

- Profile: `testflight` (store distribution, extends `production`;
  per `.github/workflows/testflight.yml` this is the documented path for
  store submissions)
- **Current build — 1.0.6 (78)**, FINISHED:
  https://expo.dev/accounts/tpaulshippy/projects/bots-for-kids/builds/11762201-7203-4e70-8f29-5f180e8ac0be
- Superseded: 1.0.6 (74) —
  https://expo.dev/accounts/tpaulshippy/projects/bots-for-kids/builds/6ff393d0-5807-45f9-a593-f3abe547655c
  (the build submitted to TestFlight on 2026-09-14; still the only build in ASC)
- Why the rebuild: the release branch merged `main` after 74 was cut, and
  `main` carries **native** changes that an OTA update cannot ship — a new
  wordless app icon, a new splash icon, and the `#0a7ea4` tint on the splash
  screen and Android adaptive icon. It also adds LaTeX math typesetting to
  chat plus a batch of chat/teen-settings/login fixes.
- Build numbering: EAS auto-increments from the remote version source
  (72 → 78). 73 and 75 were consumed by errored `npm ci` peer-deps attempts
  (fixed by `front/.npmrc` with `legacy-peer-deps=true`); 76 and 77 were
  intermediate rebuilds. 74 is the last build in App Store Connect.
- Bundle ID: com.tpaulshippy.botsforkids
- ASC app ID: 6742674793

## Steps to finish in App Store Connect

1. **Submit build 78** (NOT done — build only, no `eas submit` was run):
   `eas submit -p ios --profile production --latest` uploads the newest
   finished build; Apple processing takes 5–10 min, then it appears at
   https://appstoreconnect.apple.com/apps/6742674793/testflight/ios
   Until this runs, App Store Connect still only has build 74, which
   predates the icon and math-rendering changes.
2. In App Store Connect → Syft Learning → TestFlight: verify build 78
   processes, add testers if desired, run through the smoke test below.
3. App Store → + Version (1.0.6) → paste `WHAT_IS_NEW.md` into What's New.
4. Upload screenshots from `docs/app-store/1.0.6/screenshots/`:
   - 6.9" (iPhone 16 Pro Max, 1320×2868) — required
   - 6.5" (iPhone 13 Pro Max class, 1284×2778) — required
   - 6.7" (iPhone 14 Pro Max class, 1290×2796) — optional bonus slot
   - iPad 13" (iPad Pro 13" M4, 2064×2752) — optional but recommended
     (app supports tablet)
5. Fill App Review Information → Notes from `REVIEW_NOTES.md`
   (demo account credentials are still TODO).
6. Confirm export compliance (No non-exempt encryption), age rating 4+,
   and that the subscription group localizations are current.
7. Submit for Review.

## Smoke test (TestFlight build)

1. Fresh install → Apple/Google sign-in → onboarding wizard completes.
   (Google now always shows the account chooser, so switching accounts
   on a shared device works.)
2. Send a chat message → streams, no errors. Ask a maths question to
   confirm LaTeX renders typeset rather than as raw `$...$`.
3. Flashcards → open deck → study 3 cards with ratings.
4. Drawer → Study Materials, Stats, Activity (parent PIN flow).
5. Settings → Subscription screen loads RevenueCat offerings.
6. Check the app icon and splash — build 78 is the first to carry the
   wordless bot mark and the `#0a7ea4` tint.

## Screenshots in this package

Captured in iOS Simulator against a local backend seeded with demo data
(see `screenshots/README.md` for the exact recipe). Screenshots show the
1.0.6 highlights: onboarding, chat streaming, flashcards study, stats,
study materials, and parent activity.
