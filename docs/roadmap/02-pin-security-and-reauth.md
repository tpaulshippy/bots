# 02 — PIN Security and Reauth

## Problem

Parent controls are gated by a client-only PIN that is:

- Stored as a **plaintext integer** on `UserAccount.pin`
- Returned on every `GET /api/user`
- Cached in AsyncStorage as `@user_pin` (`front/api/pinStorage.ts`)
- Empty PIN = **no gate** on Settings
- Single field, no confirm, no min length, no clear flow
- Frontend already calls **`POST /auth/reauthenticate`** with `{pin}` — the endpoint does not exist

Once teens have their own devices (feature 01), a guessed or shoulder-surfed PIN is the only wall between a kid and bots, billing, and account deletion.

## Success criteria

- PIN is hashed at rest (never returned by API).
- `POST /api/auth/reauthenticate` verifies PIN and returns a short-lived parent capability (or 401).
- Settings and all `/parent/*` routes require a successful reauth within a TTL (e.g. 15 minutes).
- Empty PIN is not allowed once any profile exists (or once onboarding completes — feature 05).
- Confirm-on-set, 4–8 digits, lockout after N failures.
- Teen-delegated sessions can never reauth as parent via PIN.

## Current code

| Piece | Path |
|-------|------|
| Model | `back/bots/models/user_account.py` — `pin = IntegerField(null=True)` |
| Account API | `back/bots/views/user_account_view.py` — GET returns pin; POST sets pin |
| Front cache | `front/api/pinStorage.ts` |
| Gate | `front/components/PinWrapper.tsx` |
| Set PIN | `front/app/parent/setPin.tsx` |
| Login reauth attempt | `front/app/login.tsx` — `attemptReauthWithPin` |
| Settings | `front/app/parent/settings.tsx` — usage bar visible above PIN |

---

## Backend

### 1. Migrate PIN storage

```python
# UserAccount
pin_hash = models.CharField(max_length=128, null=True, blank=True)
pin_failed_attempts = models.PositiveSmallIntegerField(default=0)
pin_locked_until = models.DateTimeField(null=True, blank=True)
```

Remove plaintext `pin` after dual-read migration:

1. Add `pin_hash`.
2. Data migration: for each row with integer `pin`, set `pin_hash = make_password(str(pin))`.
3. Stop reading/writing `pin`; drop column in a follow-up migration.

Use Django `django.contrib.auth.hashers` (`make_password` / `check_password`).

### 2. API contract

**`GET /api/user`**

```json
{
  "userId": 1,
  "hasPin": true,
  "subscriptionLevel": 0,
  "cost": 0.001,
  "maxDailyCost": 0.00032,
  "timezone": "America/Phoenix"
}
```

Never return the PIN or hash.

**`POST /api/user`** (set / change PIN) — parent session only

```json
{ "pin": "1234", "currentPin": "0000" }
```

- First set: no `currentPin` required if `hasPin` is false.
- Change: require `currentPin`.
- Validate: string of 4–8 digits.
- On success: update hash, reset failures.

**`POST /api/auth/reauthenticate`**

```json
// request
{ "pin": "1234" }

// 200
{ "parentSessionToken": "<jwt or opaque>", "expiresAt": "..." }

// 401
{ "detail": "Invalid PIN", "remainingAttempts": 2 }

// 423
{ "detail": "PIN locked. Try again later.", "lockedUntil": "..." }
```

Lock after 5 failures for 15 minutes. Reset failures on success.

**`DELETE /api/user/pin`** (optional clear) — requires current PIN body; only if product wants clear. Prefer “change PIN” only so Settings cannot be left ungated accidentally.

### 3. Parent session token

Option A (simpler): return a signed JWT with claim `parent_reauth=true`, `exp=now+15m`, same user. Client sends `X-Parent-Reauth: <token>` on parent mutations.

Option B: server-side session key in cache/DB.

Prefer **Option A** — no new store. Permission helper:

```python
def has_valid_parent_reauth(request) -> bool:
    token = request.headers.get("X-Parent-Reauth")
    # verify JWT, user match, parent_reauth claim, not expired, not teen-delegated
```

Require reauth header on:

- Bot create/update/delete
- Profile create/update/delete (including oauth_email)
- PIN change
- Account delete
- Notification device preference writes (optional — settings read can stay soft-gated client-side)

Chat and flashcard kid paths never require it.

### 4. Teen-delegated denial

If `is_teen_delegated` claim: `POST /api/auth/reauthenticate` → **403** always. Teen devices must not unlock parent controls even with a correct household PIN.

---

## Frontend

### 1. Stop caching the real PIN

**Delete or gut** plaintext PIN storage. Cache only:

- `hasPin: boolean` (from GET /user)
- `parentSessionToken` + `expiresAt` in memory (SecureStore on native if available; never AsyncStorage for the reauth token if avoidable)

### 2. PinWrapper

- On mount, if parent session still valid → unlock.
- Else show keypad; on submit call `/api/auth/reauthenticate`.
- Show remaining attempts / lockout errors from API.
- Auto-lock when `expiresAt` passes (AppState foreground check).

### 3. setPin.tsx

- Two fields: PIN + Confirm.
- 4–8 digits, numeric.
- If `hasPin`, require current PIN first.
- Call POST /api/user; on success update `hasPin`.

### 4. login.tsx

Wire `attemptReauthWithPin` to the real endpoint only for **parent** “quick unlock” if product still wants PIN-before-OAuth on a shared device. After feature 01, teen devices skip this entirely.

### 5. Empty PIN

After onboarding (05) or if profiles exist: Settings shows “Set a PIN to protect parent controls” blocking card instead of open menu. Do not allow bot/profile edits until PIN exists.

---

## UI

```text
┌─────────────────────────────────────────┐
│         Enter parent PIN                │
│                                         │
│            ● ● ● ●                      │
│                                         │
│         [1] [2] [3]                     │
│         [4] [5] [6]                     │
│         [7] [8] [9]                     │
│            [0] [⌫]                      │
│                                         │
│     2 attempts remaining                │
└─────────────────────────────────────────┘
```

Set PIN:

```text
New PIN (4–8 digits)     [••••]
Confirm PIN              [••••]
[ Save PIN ]
```

---

## Tests

- Hash written; GET never includes pin
- Reauth success / wrong pin / lockout / unlock after window
- Teen JWT 403 on reauth
- Parent mutations without `X-Parent-Reauth` → 403
- Change PIN requires currentPin
- Migration of legacy integer pins

## Implementation order

1. Add pin_hash + migrate data
2. Change GET/POST /api/user contract
3. Implement /api/auth/reauthenticate + lockout
4. Enforce reauth header on parent writes
5. Frontend PinWrapper + setPin + remove plaintext cache
6. Drop integer `pin` column

## Non-goals

- Biometrics (Face ID) as a follow-on on top of reauth token
- Per-action step-up for every single settings toggle (batch into 15m session)
- SMS recovery of PIN (parent re-OAuth + support path later)

## Depends on

- Strongly pairs with **01** (teen cannot reauth).
- Can ship before 01 if teen claim check is simply “claim absent.”
