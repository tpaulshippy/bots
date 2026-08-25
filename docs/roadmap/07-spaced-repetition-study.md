# 07 — Spaced Repetition Study

## Problem

Flashcards v1 is a linear flip-through:

- No know / don’t know
- No due dates, ease, or intervals
- No shuffle
- No flip animation (PLAN leftover)
- No stats, streaks, or last-studied
- `order` exists but isn’t a learning signal
- Bot-created decks never re-surface for review

Kids create cards in chat and never see them again. That fails the “learning product” half of Syft.

## Success criteria

- Study session uses Again / Hard / Good / Easy (SM-2–style or simplified FS-RS).
- Each card has `due_at`, `interval_days`, `ease`, `reps`, `lapses`.
- Deck list shows **due count** and last studied.
- Default study queue = due cards (with optional “study all”).
- Flip animation; progress = reviewed / session size.
- End-of-session summary: correct-ish rate, next due preview.
- Profile-scoped stats endpoint for parent activity summary (04) later.

## Current code

| Piece | Path |
|-------|------|
| Models | `back/bots/models/flashcard.py`, `deck.py` |
| API | `FlashcardViewSet`, `DeckViewSet` |
| Study UI | `front/app/flashcards/study.tsx` |
| List | `front/app/flashcards.tsx` |
| Agent tools | `create_flashcard_deck`, `create_flashcard` |

---

## Backend

### 1. Scheduling fields on `Flashcard`

```python
due_at = models.DateTimeField(null=True, blank=True, db_index=True)
interval_days = models.FloatField(default=0)
ease = models.FloatField(default=2.5)
reps = models.PositiveIntegerField(default=0)
lapses = models.PositiveIntegerField(default=0)
last_reviewed_at = models.DateTimeField(null=True, blank=True)
```

New cards: `due_at=now` (immediately studyable), `reps=0`.

### 2. Review API

**`POST /api/decks/{deck_id}/flashcards/{flashcard_id}/review/`**

```json
// request
{ "rating": "again" | "hard" | "good" | "easy" }

// response: updated flashcard scheduling fields
```

Implement pure function `apply_sm2(card, rating, now) -> fields` in `back/bots/services/srs.py`.

Classic SM-2 sketch:

- again: reps=0, lapses+=1, interval=0 or 1/6 day, due=now+interval, ease=max(1.3, ease-0.2)
- hard: interval = max(1, interval * 1.2), ease -= 0.15
- good: interval = 1 if reps==0 else 6 if reps==1 else interval * ease; reps+=1
- easy: interval = same as good * 1.3; ease += 0.15; reps+=1

Keep the function unit-tested and swappable; do not inline math in the viewset.

### 3. Study queue

**`GET /api/decks/{deck_id}/study_queue/?mode=due|all&limit=50`**

Returns cards ordered by `due_at` ascending (nulls last), filtered `due_at <= now` for `mode=due`. Include scheduling fields in serializer.

### 4. Deck annotations

List serializer adds:

- `due_count`
- `last_studied_at` (max of card last_reviewed_at)

### 5. Review log (optional but recommended)

```python
class FlashcardReview(models.Model):
    flashcard = models.ForeignKey(Flashcard, on_delete=models.CASCADE, related_name='reviews')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE)
    rating = models.CharField(max_length=8)
    reviewed_at = models.DateTimeField(auto_now_add=True)
```

Enables streaks and parent “studied 20 cards” without scanning card fields.

### 6. Tool defaults

Agent-created cards get same defaults as manual (`due_at=now`). No change to tool signatures.

---

## Frontend

### 1. study.tsx overhaul

Flow:

1. Fetch `study_queue?mode=due`; if empty, offer “Study all anyway.”
2. Show front → tap flip (Animated spring/rotateY or scale crossfade).
3. After flip, reveal rating row: Again / Hard / Good / Easy.
4. POST review → next card.
5. Session complete modal: reviewed count, again count, “Next due in X.”

### 2. Deck list / detail

- Badge: “3 due”
- Study button label: “Study (3)” vs “Study”
- Optional progress ring later — not v1 required

### 3. API module

Extend `front/api/flashcards.ts` with `reviewFlashcard`, `fetchStudyQueue`, types for scheduling fields.

### 4. Chat deep link (from 06)

“Study now” opens study with that `deckId` and `mode=due`.

### 5. Haptics

Light impact on Good/Easy; warning on Again.

---

## UI

```text
┌─────────────────────────────────────────┐
│ ←  Cell Bio              Due 3 · 5 left │
├─────────────────────────────────────────┤
│         ┌───────────────────┐           │
│         │                   │           │
│         │  What is anaphase?│           │
│         │                   │           │
│         │   (flipped back)  │           │
│         │  Sister chromatids│           │
│         │  separate…        │           │
│         └───────────────────┘           │
│                                         │
│  [Again]  [Hard]  [Good]  [Easy]        │
│   <1d      1d      3d      7d           │
└─────────────────────────────────────────┘
```

Deck list row:

```text
│ Cell Bio                    3 due · 12  │
│ Last studied 2h ago                     │
```

---

## Tests

- SM-2 pure function table-driven tests (again resets; easy lengthens)
- review endpoint updates due_at; other user’s deck 404
- study_queue due filter respects timezone (use freeze_time)
- New card appears in due queue
- Deck list due_count annotation

## Implementation order

1. Migration + serializer fields
2. `srs.py` + review endpoint + unit tests
3. study_queue + deck annotations
4. Frontend study UX + animation
5. List badges
6. Review log + simple session summary

## Non-goals

- Full Anki sync / cloze / note types
- Images/audio on cards (10 may add later)
- Leeches / buried cards v1
- Global “Study all due across decks” (good follow-on once single-deck SRS is solid)

## Depends on

- Flashcards v1 (done)
- **06** for chat → study CTA (can ship SRS without it)
