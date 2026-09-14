# Screenshots — 1.0.6 (iPhone 16 Pro Max, 6.9")

Captured 2026-09-14 in the iOS Simulator (iPhone 16 Pro Max, iOS 18.5)
against a LOCAL backend seeded with demo data — no production data,
no real children, no AI costs.

## Recipe (repeatable)

```bash
# 1. Backend with seeded demo data (from back/)
python manage.py migrate
python manage.py loaddata bots/fixtures/ai_models.json
python manage.py seed_e2e_parent_review
python manage.py seed_e2e_streaming_chat
python manage.py seed_e2e_spaced_repetition
# optional: 2 demo study pages (via Django shell, HtmlPage model)
# optional: clear the e2e account PIN so the Activity shot needs no prompt
python manage.py runserver 127.0.0.1:8000

# 2. Simulator Release build pointed at the local backend.
# Release (not Debug) so no __DEV__ Developer Options / warning toast.
# The app needs NSAllowsLocalNetworking for cleartext http to 127.0.0.1
# (temporary local-only change to front/app.json, reverted afterwards):
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api \
  npx expo run:ios --configuration Release --device "<sim-udid>"

# 3. Capture (from repo root):
node scripts/capture-appstore-screenshots.js \
  --udid "<sim-udid>" \
  --app "$HOME/Library/Developer/Xcode/DerivedData/SyftLearning-*/Build/Products/Release-iphonesimulator/SyftLearning.app" \
  --out docs/app-store/1.0.6/screenshots
```

Status bar is normalized (`9:41`, full signal/battery) via
`simctl status_bar override` inside the script.

## Shots

| File | Screen | Why it's here (1.0.6 highlight) |
|---|---|---|
| 01-login | Login | Polished sign-in (Google + Apple) |
| 02-onboarding | Onboarding wizard | New 5-step guided setup |
| 03-select-bot | Bot picker | Redesigned grid, per-bot colors/icons |
| 04-chat-list | Chat list | Redesigned list |
| 05-chat | Tutoring chat | Streaming replies, camera input |
| 06-flashcards | Flashcard decks | Due badges (spaced repetition) |
| 07-deck | Deck detail | Card management |
| 08-study | Study mode | Again/Hard/Good/Easy + progress |
| 09-stats | Stats dashboard | Streaks, totals, weekly activity |
| 10-study-materials | Study Materials | Tutor-built interactive pages |
| 11-activity | Parent Activity | Transcript review inbox |

## Before uploading to App Store Connect

- 6.9" set (1320×2868): use these as-is.
- 6.5" set (1284×2778): required alongside 6.9". Either downscale these
  or re-run the recipe on an iPhone 16 Plus / 15 Pro Max simulator.
- iPad 13": recommended (the app supports tablet) — re-run on an iPad Pro
  simulator.
