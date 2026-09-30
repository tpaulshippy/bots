# Screenshots — 1.0.6 (light mode)

Captured 2026-09-14 in the iOS Simulator (iOS 18.5) against a LOCAL backend
seeded with demo data — no production data, no real children, no AI costs.

## Sets in this package

| Folder | Size class | Simulator | Pixels | For |
|---|---|---|---|---|
| `screenshots/` | 6.9" iPhone | iPhone 16 Pro Max | 1320×2868 | App Store **required** |
| `screenshots-6.5/` | 6.5" iPhone | iPhone 13 Pro Max | 1284×2778 | App Store **required** |
| `screenshots-6.7/` | 6.7" iPhone | iPhone 14 Pro Max | 1290×2796 | Bonus (6.7" slot) |
| `screenshots-ipad/` | 13" iPad | iPad Pro 13" (M4) | 2064×2752 | App Store iPad slot |

Each folder holds the same 11 shots (see table below). Upload the 6.9",
6.5", and iPad sets; the 6.7" set is optional.

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

# 3. Capture once per size class (from repo root). Example for 6.9":
node scripts/capture-appstore-screenshots.js \
  --udid "<16-pro-max-udid>" \
  --app "$HOME/Library/Developer/Xcode/DerivedData/SyftLearning-*/Build/Products/Release-iphonesimulator/SyftLearning.app" \
  --out docs/app-store/1.0.6/screenshots
# Repeat with the 13 Pro Max UDID -> screenshots-6.5,
# 14 Pro Max UDID -> screenshots-6.7, iPad Pro 13" UDID -> screenshots-ipad.
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

- 6.9" set (1320×2868): use `screenshots/` as-is. ✅ in this package
- 6.5" set (1284×2778): use `screenshots-6.5/` as-is. ✅ in this package
- iPad 13": use `screenshots-ipad/` as-is. ✅ in this package
- All sets are light mode (deliberate — see PR discussion).
