# 09 — Per-Profile Bot Access and Schedules

## Problem

Family control is incomplete:

- Every profile sees **every** bot on the account
- No bedtime / school-hour limits
- No per-kid usage visibility beyond shared account daily $ cap
- Tutorial implies “set up bots for your kids” but assignment is global
- Teen delegated login (01) locks profile identity but not *which tutors* or *when*

A parent who built a playful character bot for a younger sibling cannot stop an older teen from using it — or chatting at 1am.

## Success criteria

- Parent assigns an allowlist of bots per profile (default: all bots, backward compatible).
- Kid select-bot and chat create honor the allowlist server-side (not only UI hide).
- Optional schedule windows per profile (timezone from UserAccount): e.g. Sun–Thu 07:00–20:00.
- Outside window: chat API returns a clear, friendly blocked message; no LLM call.
- Parent Activity (04) shows per-profile usage; settings UX is PIN-gated.
- Existing accounts keep full access until a parent customizes.

## Current code

| Piece | Path |
|-------|------|
| Bot list | `BotViewSet` — all bots for user |
| Select bot | `front/app/selectBot.tsx` |
| Chat create | `back/bots/views/get_chat_response.py` |
| Profile | name only |
| Timezone | `UserAccount.timezone` |
| Daily cap | account-level only |

---

## Backend

### 1. Allowlist M2M

```python
# on Profile
allowed_bots = models.ManyToManyField(
    'Bot',
    blank=True,
    related_name='allowed_profiles',
)
# Convention:
# - empty M2M AND access_mode == "all" → all account bots (default)
# - access_mode == "allowlist" → only M2M bots
access_mode = models.CharField(
    max_length=16,
    choices=[("all", "all"), ("allowlist", "allowlist")],
    default="all",
)
```

Why not “empty means all” alone? Ambiguity after parent clears the last bot. Explicit `access_mode` avoids that.

### 2. Schedule fields

```python
class ProfileSchedule(models.Model):
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name='schedule')
    enabled = models.BooleanField(default=False)
    # list of { "dow": 0-6, "start": "07:00", "end": "20:00" } in profile/account TZ
    windows_json = models.JSONField(default=list, blank=True)
    block_message = models.CharField(
        max_length=255,
        default="It's outside your chat hours. Try again later or ask a parent.",
    )
```

Evaluation helper:

```python
def schedule_allows(profile, now_utc) -> tuple[bool, str | None]:
    ...
```

Use `UserAccount.timezone` (profile-level TZ override optional later).

### 3. Enforcement points (mandatory server-side)

1. **`get_chat_response`** (new + existing chat):
   - Resolve profile (respect teen claim from 01)
   - If bot not allowed → 403 `{code: "bot_not_allowed"}`
   - If schedule denies → 200 or 403 with **canned assistant-style message** and no model call (prefer 200 + message so clients show it in-thread like over_limit)
2. **`BotViewSet.list`**: optional `?profileId=` filters to allowed bots for kid UI; parent list without param returns all
3. **Flashcard tools / memory**: no change; they ride on chat access
4. **Streaming endpoint (06)**: same checks before stream open

Do not trust client-only filtering on `selectBot.tsx`.

### 4. API

| Method | Path | Body / notes |
|--------|------|--------------|
| GET/PATCH | `/api/profiles/{id}/access/` | `{ access_mode, bot_ids: [] }` |
| GET/PATCH | `/api/profiles/{id}/schedule/` | `{ enabled, windows, block_message }` |

Require parent session + reauth (02) on PATCH.

### 5. Soft-delete bots

If an allowlisted bot is soft-deleted, treat as not allowed. Clean M2M in bot delete signal optional.

### 6. Per-profile usage (light)

Annotation endpoint or fields on activity summary (04):

- messages today / chats today per profile  
Not a separate $ cap in v1 (account cap remains). Display only.

---

## Frontend

### 1. Profile access editor

**File:** `front/app/parent/profileAccess.tsx`

- Toggle: “All tutors” vs “Only selected”
- Multi-select list of bots with color/icon
- Save → PATCH access

Entry from profile editor.

### 2. Schedule editor

**File:** `front/app/parent/profileSchedule.tsx`

- Enable switch
- Presets: “School nights”, “Weekends open”, “Custom”
- Custom: per-day start/end pickers (keep simple — two global times + day checkboxes is enough for v1)
- Preview: “Allowed now: yes/no” using device clock + account TZ note

### 3. Kid selectBot

Fetch bots with `profileId=selected`. Empty allowlist mode with zero bots → empty state: “Ask a parent to assign a tutor.”

### 4. Blocked chat UX

When API returns schedule block, show message in thread (or alert once) without spinning forever. Same pattern as over_limit upgrade message.

### 5. Onboarding (05)

Optional step or post-onboarding: “Limit which tutors Maya can use?” skip-default-all.

---

## UI

```text
┌─────────────────────────────────────────┐
│ ←  Maya · Tutors                        │
├─────────────────────────────────────────┤
│ ○ All tutors on this account            │
│ ● Only selected tutors                  │
│                                         │
│ [✓] Penelope                            │
│ [✓] Math Coach                          │
│ [ ] Silly Dragon                        │
│                                         │
│            [ Save ]                     │
└─────────────────────────────────────────┘
```

```text
┌─────────────────────────────────────────┐
│ ←  Maya · Schedule                      │
├─────────────────────────────────────────┤
│ [✓] Limit chat hours                    │
│                                         │
│ Days  [S][M][T][W][T][F][S]             │
│       .  ✓  ✓  ✓  ✓  ✓  .               │
│ Start [ 7:00 AM ]  End [ 8:00 PM ]      │
│                                         │
│ Message when blocked                    │
│ [ It's outside your chat hours…     ]   │
│                                         │
│ Status now: Allowed (account TZ)        │
└─────────────────────────────────────────┘
```

Kid outside hours:

```text
│ assistant: It's outside your chat       │
│ hours. Try again later or ask a parent. │
```

---

## Tests

- Default access_mode=all → any bot works
- allowlist without bot → chat 403/canned; list empty for profileId
- allowlist with bot → success
- schedule disabled → always allow
- schedule enabled outside window → no LLM invoke (mock)
- schedule boundary at start inclusive / end exclusive (document + test)
- Teen cannot PATCH access/schedule
- Other user’s profile 404
- Soft-deleted bot not usable even if still in M2M

## Implementation order

1. Models + access_mode defaults + migrations
2. `bot_allowed` + `schedule_allows` helpers
3. Enforce in get_chat_response (+ stream)
4. Access/schedule API
5. Parent editors
6. selectBot filter + empty state
7. Activity per-profile counts if 04 exists

## Non-goals

- Multi-parent / teacher org roles (follow-on)
- Per-bot schedules (profile-level is enough)
- Hard kill-switch wiping chats at bedtime
- Separate per-profile dollar caps v1
- Geofencing

## Depends on

- **01** profile lock for teens
- **02** reauth on parent edits
- **05** profile-centric settings entry
- **04** for usage display (optional)
