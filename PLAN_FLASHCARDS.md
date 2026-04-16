# Flashcards Study Feature - Implementation Plan

## Overview
Add a flashcard system to the app where:
- Users can create, edit, and delete flashcard sets (e.g., "Biology Test Terms", "Memory Verses")
- Each set contains multiple flashcards with front/back text
- Bot can create flashcards via tool calls during chat (optionally adding to a set)
- Study mode uses flip card interface per set
- Hamburger menu in header switches between Chat and Flashcards views

## Requirements

### Storage
- Flashcard sets and flashcards stored per profile (child account)
- No limit on number of sets or cards per profile

### Creation
- Manual entry: Users create sets and add cards with front/back text
- Auto-generate: Bot can create flashcards via tool call during chat

### Study Interface
- Flip card animation to reveal answer
- Navigate between cards in a set (prev/next)
- Select which set to study

### Access
- Hamburger menu at top-left to switch between Chat list and Flashcards

---

## Backend Implementation (Django)

### 1. Create Deck Model
**File:** `back/bots/models/flashcard.py`

```python
class Deck(models.Model):
    flashcard_set_id = models.UUIDField(default=uuid.uuid4, unique=True)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='flashcard_sets')
    chat = models.ForeignKey(Chat, on_delete=models.SET_NULL, null=True, blank=True, related_name='flashcard_sets')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    flashcard_set = models.ForeignKey(Deck, on_delete=models.CASCADE, related_name='flashcards')
    front = models.TextField()
    back = models.TextField()
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

Add to `back/bots/models/__init__.py`

### 2. Create Flashcard Serializers
**File:** `back/bots/serializers/flashcard_serializer.py`

```python
class FlashcardSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'flashcard_set', 'front', 'back', 'order', 'created_at', 'updated_at']


class DeckSerializer(serializers.HyperlinkedModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Deck
        fields = ['id', 'flashcard_set_id', 'profile', 'chat', 'name', 'description', 'flashcards', 'card_count', 'created_at', 'updated_at']


class DeckListSerializer(serializers.HyperlinkedModelSerializer):
    card_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Deck
        fields = ['id', 'flashcard_set_id', 'name', 'description', 'card_count', 'created_at', 'updated_at']
```

Add to `back/bots/serializers/__init__.py`

### 3. Create Flashcard Viewsets
**File:** `back/bots/viewsets/flashcard_viewset.py`

#### DeckViewSet
- `GET /flashcard_sets.json` - List all sets for profile
- `POST /flashcard_sets.json` - Create new set
- `GET /flashcard_sets/{id}.json` - Retrieve set with all flashcards
- `PUT /flashcard_sets/{id}.json` - Update set
- `DELETE /flashcard_sets/{id}.json` - Delete set (cascades to flashcards)

#### FlashcardViewSet
- `GET /flashcard_sets/{set_pk}/flashcards.json` - List cards in a set
- `POST /flashcard_sets/{set_pk}/flashcards.json` - Add card to set
- `GET /flashcard_sets/{set_pk}/flashcards/{id}.json` - Retrieve card
- `PUT /flashcard_sets/{set_pk}/flashcards/{id}.json` - Update card
- `DELETE /flashcard_sets/{set_pk}/flashcards/{id}.json` - Delete card

Filter sets by profile from query params. Permission: IsOwner.

Annotate with card_count for list view.

### 4. Register Routes
**File:** `back/server/urls.py`

Add router registration for FlashcardViewSet.

### 5. Bot Tool Call Handler
**File:** `back/bots/views/get_chat_response.py`

When bot returns a tool call with action "create_flashcard" or "create_flashcard_set", parse and create Deck/Flashcard entries.

Tool call format from bot:
```json
{
  "tool": "create_flashcard_set",
  "parameters": {
    "name": "Biology Test Terms",
    "description": "Key terms for Chapter 5",
    "flashcards": [
      {"front": "What is photosynthesis?", "back": "The process by which plants convert light energy into chemical energy"},
      {"front": "What is cellular respiration?", "back": "The process of converting glucose into ATP"}
    ]
  }
}
```

Or single card:
```json
{
  "tool": "create_flashcard",
  "parameters": {
    "set_name": "Memory Verses",
    "front": "John 3:16",
    "back": "For God so loved the world..."
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
  flashcard_set: number;
  front: string;
  back: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: number;
  flashcard_set_id: string;
  profile: string;
  chat: string | null;
  name: string;
  description: string;
  flashcards: Flashcard[];
  card_count: number;
  created_at: string;
  updated_at: string;
}

export interface DeckListItem {
  id: number;
  flashcard_set_id: string;
  name: string;
  description: string;
  card_count: number;
  created_at: string;
  updated_at: string;
}

// Deck endpoints
export const fetchDecks = async (profileId: string): Promise<DeckListItem[]>
export const fetchDeck = async (id: number): Promise<Deck>
export const createDeck = async (name: string, description: string, profileId: string, chatId?: string): Promise<Deck>
export const updateDeck = async (id: number, name: string, description: string): Promise<Deck>
export const deleteDeck = async (id: number): Promise<void>

// Flashcard endpoints
export const fetchFlashcards = async (setId: number): Promise<Flashcard[]>
export const createFlashcard = async (setId: number, front: string, back: string): Promise<Flashcard>
export const updateFlashcard = async (id: number, front: string, back: string): Promise<Flashcard>
export const deleteFlashcard = async (id: number): Promise<void>
```

### 2. Navigation Update
**File:** `front/app/_layout.tsx`

- Replace current headerLeft (empty) with hamburger menu icon (IconSymbol "list.bullet")
- On press: toggle between "chats" and "flashcards" mode
- Show different list based on mode

### 3. Flashcard Set List Screen
**File:** `front/app/flashcards.tsx`

- FlatList of all flashcard sets
- Each item shows set name, card count, and truncated description
- Tap set to view/edit cards or start studying
- FAB to create new set

### 4. Flashcard Set Detail/Edit Screen
**File:** `front/app/flashcards/set.tsx`

- Header shows set name (editable) and description
- FlatList of all flashcards in set
- Each card shows truncated front text
- Tap card to edit
- FAB to add new card to set
- "Study" button in header to start study mode

### 5. Flashcard Edit Modal/Screen
**File:** `front/app/flashcards/cardEdit.tsx` (or modal)

- Form with "Front" and "Back" text inputs
- Save/Cancel buttons
- Delete button if editing existing

### 6. Flashcard Study Screen
**File:** `front/app/flashcards/study.tsx`

- Accepts setId parameter
- Display current card (front side)
- Tap card to flip (animate)
- Previous/Next buttons to navigate
- Progress indicator (e.g., "3 / 10")
- Exit button to return to set

### 6. Chat Integration
**File:** `front/app/botChat.tsx`

- After sending message, check response for flashcard tool call results
- If bot created flashcards, show toast/notification: "X flashcards created"
- Store flashcard IDs in response for potential editing

---

## UI Specifications

### Flashcard Sets List
```
┌─────────────────────────────────────────┐
│ ←  My Flashcard Sets                    │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Biology Test Terms         12 cards │ │
│ │ Chapter 5 vocabulary                 │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Memory Verses              5 cards  │ │
│ │ Sunday school verses                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│                           [+ Create Set]│
└─────────────────────────────────────────┘
```

### Flashcard Set Detail
```
┌─────────────────────────────────────────┐
│ ← Back     Biology Test    [Study]      │
├─────────────────────────────────────────┤
│ Description: Chapter 5 vocabulary        │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ What is photosynthesis?      [...]  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ What is cellular respiration? [...]  │ │
│ └─────────────────────────────────────┘ │
│                           [+ Add Card]   │
└─────────────────────────────────────────┘
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
- `back/bots/models/flashcard.py` - Deck and Flashcard models
- `back/bots/serializers/flashcard_serializer.py` - Serializers for both models
- `back/bots/viewsets/flashcard_viewset.py` - ViewSets for both models

### Modified Backend Files
- `back/bots/models/__init__.py` - Export Deck, Flashcard
- `back/bots/serializers/__init__.py` - Export serializers
- `back/server/urls.py` - Add flashcard routes
- `back/bots/views/get_chat_response.py` - Handle flashcard tool calls

### New Frontend Files
- `front/api/flashcards.ts` - API module for sets and cards
- `front/app/flashcards.tsx` - List of flashcard sets
- `front/app/flashcards/set.tsx` - Set detail with card list
- `front/app/flashcards/cardEdit.tsx` - Create/edit card form
- `front/app/flashcards/study.tsx` - Study mode with flip cards

### Modified Frontend Files
- `front/app/_layout.tsx` - Add hamburger menu, toggle between chats/flashcards
- `front/app/botChat.tsx` - Handle flashcard creation from bot responses

---

## Implementation Order

1. Backend: Create models, serializers, viewset, routes
2. Backend: Add tool call handler in chat response view
3. Frontend: Create API module
4. Frontend: Update navigation/layout with hamburger menu
5. Frontend: Create flashcard sets list screen
6. Frontend: Create set detail screen with card list
7. Frontend: Create card edit screen
8. Frontend: Create study screen with flip animation
9. Frontend: Integrate flashcard creation in chat
10. Test and verify end-to-end flow