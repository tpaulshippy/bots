# Submission Checklist — Syft Learning 1.0.6

## Build (done — see links)

- Profile: `testflight` (store distribution, extends `production`;
  per `.github/workflows/testflight.yml` this is the documented path for
  store submissions)
- EAS build: https://expo.dev/accounts/tpaulshippy/projects/bots-for-kids/builds/6ff393d0-5807-45f9-a593-f3abe547655c
- Version: 1.0.6, build number auto-incremented (72 → 74; 73 was consumed
  by an errored `production`-profile attempt that failed on `npm ci`
  peer-deps — fixed by `front/.npmrc` with `legacy-peer-deps=true`)
- Bundle ID: com.tpaulshippy.botsforkids
- ASC app ID: 6742674793

## Steps to finish in App Store Connect

1. ~~Submit the finished build to TestFlight~~ DONE 2026-09-14:
   `eas submit -p ios --profile production --latest` uploaded build 74;
   Apple processing (5–10 min), then visible at
   https://appstoreconnect.apple.com/apps/6742674793/testflight/ios
2. In App Store Connect → Syft Learning → TestFlight: verify build 1.0.6
   processes, add testers if desired, run through the smoke test below.
3. App Store → + Version (1.0.6) → paste `WHAT_IS_NEW.md` into What's New.
4. Upload screenshots from `docs/app-store/1.0.6/screenshots/`:
   - 6.9" (iPhone 16 Pro Max, 1320×2868) — required
   - 6.5" (iPhone 15 Pro Max class, 1284×2778) — reuse 6.9" set scaled,
     or capture separately
   - iPad 13" (optional but recommended — app supports tablet)
5. Fill App Review Information → Notes from `REVIEW_NOTES.md`
   (demo account credentials are still TODO).
6. Confirm export compliance (No non-exempt encryption), age rating 4+,
   and that the subscription group localizations are current.
7. Submit for Review.

## Smoke test (TestFlight build)

1. Fresh install → Apple/Google sign-in → onboarding wizard completes.
2. Send a chat message → streams, no errors.
3. Flashcards → open deck → study 3 cards with ratings.
4. Drawer → Study Materials, Stats, Activity (parent PIN flow).
5. Settings → Subscription screen loads RevenueCat offerings.

## Screenshots in this package

Captured in iOS Simulator against a local backend seeded with demo data
(see `screenshots/README.md` for the exact recipe). Screenshots show the
1.0.6 highlights: onboarding, chat streaming, flashcards study, stats,
study materials, and parent activity.
