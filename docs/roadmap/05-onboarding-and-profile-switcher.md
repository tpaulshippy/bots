# 05 — First-Run Onboarding and Profile Switcher

## Problem

A brand-new parent can land on `/chat` with:

- No intentional profile selection (“Please select a profile first” on send)
- Signup signal creates a profile named `user.first_name` and a Penelope bot — but the UI never explains that or asks for a kid name
- Profile switching is buried under PIN → Profiles → tap (and long-press to edit)
- No guided PIN setup, notifications opt-in, or “add your first bot” moment
- Tutorial lives on the marketing site, not in the app

This is the conversion leak between App Store install and first successful kid message.

## Success criteria

- First launch after OAuth: 4-step wizard completes in under 3 minutes.
- Steps: Welcome → Kid profile name → First bot (template) → PIN + notifications.
- Wizard is skip-resistant for critical steps (profile + PIN) but allows “later” on notifications.
- After onboarding, header/drawer shows **current kid** chip; tap switches profiles without opening Settings.
- Returning users who already have profiles never see the wizard (`onboarding_completed_at` or heuristic).
- Empty states on chat/flashcards point to the next action, not a dead end.

## Current code

| Piece | Path |
|-------|------|
| Signup provisioning | `back/bots/signals.py` — profile + Penelope + seed chat |
| Index redirect | `front/app/index.tsx` |
| Profile select | `front/app/parent/profilesList.tsx` — double `router.back()` |
| Selected profile | `front/hooks/useSelectedProfile.ts` |
| Select bot | `front/app/selectBot.tsx` |
| Set PIN | `front/app/parent/setPin.tsx` |
| Notifications | `front/app/parent/notifications.tsx` |

---

## Backend

### 1. Onboarding flag

**`UserAccount.onboarding_completed_at`** DateTime null.

`GET /api/user` returns `onboardingCompleted: bool`.

`POST /api/user/onboarding/complete` sets timestamp (idempotent).

Heuristic fallback if flag missing on old clients: `onboardingCompleted = hasPin && profiles_count >= 1` — but prefer explicit flag set by wizard.

### 2. Optional bootstrap endpoint

`POST /api/onboarding/bootstrap`

```json
{
  "profileName": "Maya",
  "botName": "Penelope",
  "templateName": "Blank",
  "pin": "1234"
}
```

Atomic: ensure profile name updated (or create if parent deleted default), ensure bot exists/updated, set PIN hash (feature 02), mark onboarding complete.

If 02 not shipped yet, set PIN via existing POST /user path inside the same service.

Idempotent enough to retry: match by “default” profile / first bot where possible.

### 3. Do not break signup signal

Keep Penelope provisioning. Wizard **renames** default profile and can edit first bot rather than creating duplicates. Document: if signal already created “John” profile, step 2 pre-fills and renames.

---

## Frontend

### 1. Wizard routes

**Files:**

- `front/app/onboarding/index.tsx` — pager or stack
- `front/app/onboarding/profile.tsx`
- `front/app/onboarding/bot.tsx`
- `front/app/onboarding/protect.tsx` — PIN + notifications

Gate in `index.tsx` / auth bootstrap:

```
token && !onboardingCompleted && !isTeenDelegated → /onboarding
```

Teen delegated sessions **skip** wizard (parent already set them up).

### 2. Step content

**Welcome**

- “Syft is AI tutoring you control.”
- CTA: Get started

**Kid**

- Single name field, big type
- Copy: “Who will be chatting?”
- Pre-fill existing first profile name

**Bot**

- Reuse simple template picker (Blank / Character) + appearance
- Defaults: Blank, name Penelope, teal, sparkles icon
- Save via existing bot API or bootstrap

**Protect**

- PIN create (confirm field) — required
- Notifications toggle — optional, default off until OS permission
- Finish → `onboarding/complete` → `/chat`

### 3. Profile switcher

**Files:** `front/components/ProfileSwitcher.tsx` (new), header in `_layout.tsx` or chat screens, drawer header

- Chip: avatar initial + name
- Action sheet / modal: list profiles, checkmark on selected, “Manage profiles…” → PIN → profilesList
- Kid (non-delegated shared device): switching allowed
- Teen delegated: chip display-only, no manage

Fix profilesList selection navigation: `router.dismiss` / replace instead of double `back()`.

### 4. Empty states

- No bots: CTA “Create a tutor” → bot editor (PIN)
- No profile selected: auto-select first profile; if none, force onboarding/profile
- Flashcards empty: keep “created from chats” + link to chat

### 5. Settings entry polish

Remove debug `Update: {Updates.updateId}` from production settings (or gate `__DEV__`). Not the core feature but part of “first impression” while touching settings.

---

## UI

```text
┌─────────────────────────────────────────┐
│  Step 2 of 4                            │
│                                         │
│  What's your child's name?              │
│                                         │
│  [ Maya                              ]  │
│                                         │
│                          [ Continue ]   │
└─────────────────────────────────────────┘
```

Header chip:

```text
┌─────────────────────────────────────────┐
│ ☰   Chats              [ Maya ▾ ]       │
└─────────────────────────────────────────┘
```

---

## Tests

- Bootstrap creates/renames profile, bot, pin, flag
- GET user reflects onboardingCompleted
- Teen delegated complete endpoint 403 or no-op
- Frontend: bootstrap session without flag → onboarding route (component test)
- Profile switcher changes selected profile id in storage

## Implementation order

1. Account flag + GET field + complete endpoint
2. Wizard screens + gate
3. Bootstrap or sequential existing APIs
4. Profile switcher chip
5. Empty-state CTAs
6. Fix profilesList navigation

## Non-goals

- Full classroom roster import
- Multi-kid bulk add in v1 (can “Add another kid” secondary CTA after finish)
- Replacing marketing /tutorial site
- Paywall inside onboarding (mention free tier lightly only)

## Depends on

- **02** for proper PIN hashing (can call interim PIN API)
- **01** to skip wizard for teens
