# 04 — Parent Conversation Review

## Problem

Parents get Expo push on new kid messages, then must use the **kid chat UI** to read anything. There is:

- No parent inbox / transcript browser
- No per-profile activity summary
- No flagging, search, or “jump to moment”
- No digest (every message can spam; both notify flags on → **neither** fires — bug in `bots/signals.py`)
- Safety blocks (feature 03) have nowhere parent-visible to land

Notifications without a review surface train parents to ignore pushes.

## Success criteria

- PIN-gated **Activity** screen: list of recent chats across profiles with preview, time, bot, message count.
- Tap → read-only transcript (parent can scroll full history, not limited to last 10).
- Filters: profile, bot, date range, “has safety event.”
- Fix device notify mutual-exclusion bug; add digest mode.
- Optional nightly email/push digest: “Maya had 3 chats; 1 safety notice.”
- Parent cannot send as the kid from this UI (read-only). Teen-delegated sessions cannot open Activity.

## Current code

| Piece | Path |
|-------|------|
| Chat list (kid) | `front/app/chatList.tsx` |
| Chat read API | `ChatViewSet`, `MessageViewSet` — already parent-owned |
| Push | `back/bots/signals.py` — mutual exclusion bug |
| Device flags | `notify_on_new_chat`, `notify_on_new_message` |
| Notifications UI | `front/app/parent/notifications.tsx` — single switch |
| Safety events | feature 03 `SafetyEvent` |

---

## Backend

### 1. Fix notification signal logic

**File:** `back/bots/signals.py`

Current (broken): fire only if one flag true and the other false.

Target:

```python
if created_chat and device.notify_on_new_chat:
    send_push(...)
if created_user_message and device.notify_on_new_message:
    send_push(...)
```

Independent flags. Add `notify_digest_only` boolean (default False). When True, suppress per-message/chat pushes; digest job handles it.

### 2. Parent activity API

Do **not** invent a parallel message store. Add query params + a thin aggregate endpoint.

**`GET /api/activity/chats/`** (parent reauth optional for read; require parent session not teen)

Query: `profileId`, `botId`, `since`, `until`, `hasSafetyEvent=true`, pagination.

Response list items:

```json
{
  "chat_id": "...",
  "title": "...",
  "profile": {"profile_id": "...", "name": "Maya"},
  "bot": {"bot_id": "...", "name": "Penelope", "color": "...", "icon": "..."},
  "message_count": 12,
  "last_message_preview": "Can you help with fractions?",
  "last_message_at": "...",
  "safety_event_count": 1
}
```

Implement via annotation on existing `Chat` queryset (`last message` subquery, safety count).

**`GET /api/activity/chats/{chat_id}/`** — full messages including roles user/assistant (still exclude raw system if desired), plus safety events for that chat.

**`GET /api/activity/summary/?days=7`**

```json
{
  "profiles": [
    {
      "profile_id": "...",
      "name": "Maya",
      "chat_count": 5,
      "message_count": 40,
      "safety_event_count": 1,
      "top_bots": [{"name": "Penelope", "count": 3}]
    }
  ]
}
```

### 3. Digest job

Management command or Celery-less cron-friendly command:

`python manage.py send_activity_digests`

- For each UserAccount with any device `notify_digest_only` or account-level `digest_hour` preference
- Summarize last 24h activity
- Expo push title: “Syft daily summary”; body: “Maya: 3 chats · Sam: 1 chat”
- If no activity, skip (don’t spam)

Wire via GitHub Action / host cron in deploy docs — not in-app.

### 4. Device serializer expansion

Expose independently:

- `notify_on_new_chat`
- `notify_on_new_message`
- `notify_digest_only`

Validation: if digest_only, the other two may still be stored but ignored at send time (or force false — pick one, test it).

---

## Frontend

### 1. Activity screen

**File:** `front/app/parent/activity.tsx` (new)

- Entry from Settings row “Activity” and optional drawer item for parent sessions only
- Section header: 7-day summary chips per kid
- FlatList of chats (activity endpoint)
- Tap → `front/app/parent/activityChat.tsx` read-only transcript (reuse `ChatMessage` in read-only mode, no composer)

### 2. Notifications settings

**File:** `front/app/parent/notifications.tsx`

Replace single switch with:

- Notify on new chat
- Notify on each message
- Daily digest only (disables the two above in UI when enabled)

### 3. Safety badge

If `safety_event_count > 0`, show shield badge on list row. In transcript, inline subtle marker above the refused turn.

### 4. Deep link from push

Existing `useNotificationChatNavigation` opens kid chat. For parent-tapped digest / future `type=activity` payload, open `/parent/activityChat?chatId=`.

Keep kid message pushes opening kid chat (parent on shared device may still want that). Prefer payload:

```json
{ "chat_id": "...", "target": "parent_activity" | "chat" }
```

---

## UI

```text
┌─────────────────────────────────────────┐
│ ←  Activity                             │
├─────────────────────────────────────────┤
│ This week                               │
│ [Maya 5] [Sam 2]  1 safety notice       │
├─────────────────────────────────────────┤
│ Maya · Penelope              2:14 PM    │
│ “Can you help with fractions?”   🛡     │
├─────────────────────────────────────────┤
│ Sam · Math Bot               Yesterday  │
│ “What is a prime number?”               │
└─────────────────────────────────────────┘
```

Transcript:

```text
┌─────────────────────────────────────────┐
│ ←  Maya · Penelope                      │
│ Read only · 12 messages                 │
├─────────────────────────────────────────┤
│ [user bubble]                           │
│ [assistant bubble]                      │
│ ⚠ Syft blocked an unsafe reply          │
│ [refusal bubble]                        │
└─────────────────────────────────────────┘
```

---

## Tests

- Signal: both flags true → both event types can fire (separate tests)
- Digest-only suppresses immediate message push
- Activity list scoped to owner; other user’s chat 404
- Teen JWT 403 on `/api/activity/*`
- Summary counts match fixtures
- hasSafetyEvent filter

## Implementation order

1. Fix signals + device fields + notifications UI
2. Activity list/detail/summary endpoints
3. Parent Activity screens
4. Safety badge integration (after 03)
5. Digest command + cron docs
6. Push payload target routing

## Non-goals

- Parent injecting messages into the kid thread
- Live “watch typing” surveillance
- Full-text search v1 (add later with Postgres)
- Email digests until `EMAIL_BACKEND` is real (push first)

## Depends on

- **02** for PIN gate on Activity entry
- **03** for safety badges (ship list without badges first if needed)
- **01** so teens cannot open Activity
