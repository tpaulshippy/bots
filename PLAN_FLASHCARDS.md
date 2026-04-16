# Flashcards Study Feature - Implementation Plan

## Overview
Add a flashcard system to the app where:
- Users can manually create, edit, and delete flashcards
- Bot can create flashcards via tool calls during chat
- Study mode uses flip card interface
- Hamburger menu in header switches between Chat and Flashcards views

## Requirements

### Storage
- Flashcards stored per profile (child account)
- No limit on number of flashcards per profile

### Creation
- Manual entry: Users create cards with front/back text
- Auto-generate: Bot can create flashcards via tool call during chat

### Study Interface
- Flip card animation to reveal answer
- Navigate between cards (prev/next)

### Access
- Hamburger menu at top-left to switch between Chat list and Flashcards

---

## Backend Implementation (Django)

### 1. Create Flashcard Model
**File:** `back/bots/models/flashcard.py`

```python
class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='flashcards')
    chat = models.ForeignKey(Chat, on_delete=models.SET_NULL, null=True, blank=True, related_name='flashcards')
    front = models.TextField()
    back = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

Add to `back/bots/models/__init__.py`

### 2. Create Flashcard Serializer
**File:** `back/bots/serializers/flashcard_serializer.py`

```python
class FlashcardSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'profile', 'chat', 'front', 'back', 'created_at', 'updated_at']
```

Add to `back/bots/serializers/__init__.py`

### 3. Create Flashcard ViewSet
**File:** `back/bots/viewsets/flashcard_viewset.py`

- `GET /flashcards.json` - List all flashcards for profile
- `POST /flashcards.json` - Create new flashcard
- `GET /flashcards/{id}.json` - Retrieve flashcard
- `PUT /flashcards/{id}.json` - Update flashcard
- `DELETE /flashcards/{id}.json` - Delete flashcard

Filter by profile from query params. Permission: IsOwner.

### 4. Register Routes
**File:** `back/server/urls.py`

Add router registration for FlashcardViewSet.

### 5. Bot Tool Call Handler
**File:** `back/bots/views/get_chat_response.py`

When bot returns a tool call with action "create_flashcard", parse and create Flashcard entries.

Tool call format from bot:
```json
{
  "tool": "create_flashcard",
  "parameters": {
    "front": "Question text",
    "back": "Answer text"
  }
}
```

---

## Frontend Implementation (React Native/Expo)

### 1. Flashcard API Module
**File:** `front/api/flashcards.ts`

```typescript
export interface Flashcard {
  id: number;
  flashcard_id: string;
  profile: string;
  chat: string | null;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
}

export const fetchFlashcards = async (profileId: string): Promise<Flashcard[]>
export const createFlashcard = async (front: string, back: string, profileId: string, chatId?: string): Promise<Flashcard>
export const updateFlashcard = async (id: number, front: string, back: string): Promise<Flashcard>
export const deleteFlashcard = async (id: number): Promise<void>
```

### 2. Navigation Update
**File:** `front/app/_layout.tsx`

- Replace current headerLeft (empty) with hamburger menu icon (IconSymbol "list.bullet")
- On press: toggle between "chats" and "flashcards" mode
- Show different list based on mode

### 3. Flashcard List Screen
**File:** `front/app/flashcards.tsx`

- FlatList of all flashcards (grouped by created_at date maybe)
- Each item shows truncated front text
- Tap to view/edit
- FAB to create new flashcard

### 4. Flashcard Edit Screen
**File:** `front/app/flashcards/edit.tsx`

- Form with "Front" and "Back" text inputs
- Save/Cancel buttons
- Delete button if editing existing

### 5. Flashcard Study Screen
**File:** `front/app/flashcards/study.tsx`

- Display current card (front side)
- Tap card to flip (animate)
- Previous/Next buttons to navigate
- Progress indicator (e.g., "3 / 10")
- Exit button to return to list

### 6. Chat Integration
**File:** `front/app/botChat.tsx`

- After sending message, check response for flashcard tool call results
- If bot created flashcards, show toast/notification: "X flashcards created"
- Store flashcard IDs in response for potential editing

---

## UI Specifications

### Flashcard List Item
```
┌─────────────────────────────┐
│ What is photosynthesis?     │
│ Created: Today              │
└─────────────────────────────┘
```

### Study Screen
```
┌─────────────────────────────┐
│ ← Back    Study (3/10)     │
├─────────────────────────────┤
│                             │
│    ┌───────────────────┐    │
│    │                   │    │
│    │   What is the     │    │
│    │   capital of      │    │
│    │   France?         │    │
│    │                   │    │
│    │   Tap to reveal   │    │
│    │                   │    │
│    └───────────────────┘    │
│                             │
│  ← Prev        Next →       │
│                             │
└─────────────────────────────┘
```

(After tap - shows answer side)

### Hamburger Menu
- Icon: "list.bullet" from IconSymbol
- Position: Header left (replaces any existing back button when on root screens)
- Behavior: Opens drawer or toggles view mode

---

## File Summary

### New Backend Files
- `back/bots/models/flashcard.py`
- `back/bots/serializers/flashcard_serializer.py`
- `back/bots/viewsets/flashcard_viewset.py`

### Modified Backend Files
- `back/bots/models/__init__.py` - Export Flashcard
- `back/bots/serializers/__init__.py` - Export FlashcardSerializer
- `back/server/urls.py` - Add flashcard routes
- `back/bots/views/get_chat_response.py` - Handle flashcard tool calls

### New Frontend Files
- `front/api/flashcards.ts`
- `front/app/flashcards.tsx`
- `front/app/flashcards/edit.tsx`
- `front/app/flashcards/study.tsx`

### Modified Frontend Files
- `front/app/_layout.tsx` - Add hamburger menu, toggle between chats/flashcards
- `front/app/botChat.tsx` - Handle flashcard creation from bot responses

---

## Implementation Order

1. Backend: Create model, serializer, viewset, routes
2. Backend: Add tool call handler in chat response view
3. Frontend: Create API module
4. Frontend: Update navigation/layout with hamburger menu
5. Frontend: Create flashcard list screen
6. Frontend: Create flashcard edit screen
7. Frontend: Create study screen with flip animation
8. Frontend: Integrate flashcard creation in chat
9. Test and verify end-to-end flow