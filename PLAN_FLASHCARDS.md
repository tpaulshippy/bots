# Flashcards Study Feature - Implementation Plan

## Overview
Add a flashcard system to the app where:
- Users can create, edit, and delete flashcard decks (e.g., "Biology Test Terms", "Memory Verses")
- Each deck contains multiple flashcards with front/back text
- Bot can create flashcards via tool calls during chat (optionally adding to a deck)
- Study mode uses flip card interface per deck
- Hamburger menu in header switches between Chat and Flashcards views

## Requirements

### Storage
- Flashcard decks and flashcards stored per profile (child account)
- No limit on number of decks or cards per profile

### Creation
- Manual entry: Users create decks and add cards with front/back text
- Auto-generate: Bot can create flashcards via tool call during chat

### Study Interface
- Flip card animation to reveal answer
- Navigate between cards in a deck (prev/next)
- Select which deck to study

### Access
- Hamburger menu at top-left to switch between Chat list and Flashcards

---

## Backend Implementation (Django)

### 1. Create Deck Model
**File:** `back/bots/models/flashcard.py`

```python
class Deck(models.Model):
    deck_id = models.UUIDField(default=uuid.uuid4, unique=True)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='decks')
    chat = models.ForeignKey(Chat, on_delete=models.SET_NULL, null=True, blank=True, related_name='decks')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Flashcard(models.Model):
    flashcard_id = models.UUIDField(default=uuid.uuid4, unique=True)
    deck = models.ForeignKey(Deck, on_delete=models.CASCADE, related_name='flashcards')
    front = models.TextField()
    back = models.TextField()
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["deck", "order"], name="unique_flashcard_order_per_deck")
        ]
        indexes = [
            models.Index(fields=["deck", "order"])
        ]
```

Add to `back/bots/models/__init__.py`

### 2. Create Flashcard Serializers
**File:** `back/bots/serializers/flashcard_serializer.py`

```python
class FlashcardSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'flashcard_id', 'deck', 'front', 'back', 'order', 'created_at', 'updated_at']


class DeckSerializer(serializers.HyperlinkedModelSerializer):
    flashcards = FlashcardSerializer(many=True, read_only=True)
    card_count = serializers.SerializerMethodField()

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'profile', 'chat', 'name', 'description', 'flashcards', 'card_count', 'created_at', 'updated_at']


class DeckListSerializer(serializers.HyperlinkedModelSerializer):
    card_count = serializers.SerializerMethodField()

    class Meta:
        model = Deck
        fields = ['id', 'deck_id', 'name', 'description', 'card_count', 'created_at', 'updated_at']
```

Add to `back/bots/serializers/__init__.py`

### 3. Create Flashcard Viewsets
**File:** `back/bots/viewsets/flashcard_viewset.py`

#### DeckViewSet
- `GET /decks.json` - List all decks for profile
- `POST /decks.json` - Create new deck
- `GET /decks/{deck_id}.json` - Retrieve deck with all flashcards
- `PUT /decks/{deck_id}.json` - Update deck
- `DELETE /decks/{deck_id}.json` - Delete deck (cascades to flashcards)

#### FlashcardViewSet
- `GET /decks/{deck_id}/flashcards.json` - List cards in a deck
- `POST /decks/{deck_id}/flashcards.json` - Add card to deck
- `GET /decks/{deck_id}/flashcards/{flashcard_id}.json` - Retrieve card
- `PUT /decks/{deck_id}/flashcards/{flashcard_id}.json` - Update card
- `DELETE /decks/{deck_id}/flashcards/{flashcard_id}.json` - Delete card

Filter decks by profile from query params. Permission: IsOwner.

Scope decks to profiles the authenticated user is authorized to access. If a profile filter is provided, validate it belongs to the authenticated user before applying it. Permission: enforce object-level ownership checks server-side (not query-param trust).

Annotate with card_count for list view.

### 4. Register Routes
**File:** `back/server/urls.py`

Add router registration for FlashcardViewSet.

### 5. Bot Tool Call Handler
**File:** `back/bots/models/chat.py` (inside existing agent tool-call loop)

Define tools with `@tool` and bind them alongside existing tools. Handle tool calls using LangChain `tool_call["name"]` and `tool_call["args"]`. When bot returns a tool call with name "create_flashcard" or "create_deck", parse and create Deck/Flashcard entries. Persist Deck/Flashcard in the tool implementation and return structured tool results.

Tool call format from bot (LangChain style):
```json
{
  "name": "create_flashcard_deck",
  "args": {
    "name": "Biology Test Terms",
    "description": "Key terms for Chapter 5",
    "flashcards": [
      {"front": "What is photosynthesis?", "back": "The process by which plants convert light energy into chemical energy"},
      {"front": "What is cellular respiration?", "back": "The process of converting glucose into ATP"}
    ]
  },
  "id": "call_abc123"
}
```

Or single card:
```json
{
  "name": "create_flashcard",
  "args": {
    "deck_name": "Memory Verses",
    "front": "John 3:16",
    "back": "For God so loved the world..."
  },
  "id": "call_xyz789"
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
  deck: number;
  front: string;
  back: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: number;
  deck_id: string;
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
  deck_id: string;
  name: string;
  description: string;
  card_count: number;
  created_at: string;
  updated_at: string;
}

// Deck endpoints
export const fetchDecks = async (profileId: string): Promise<DeckListItem[]>
export const fetchDeck = async (deckId: string): Promise<Deck>
export const createDeck = async (name: string, description: string, profileId: string, chatId?: string): Promise<Deck>
export const updateDeck = async (deckId: string, name: string, description: string): Promise<Deck>
export const deleteDeck = async (deckId: string): Promise<void>

// Flashcard endpoints
export const fetchFlashcards = async (deckId: string): Promise<Flashcard[]>
export const createFlashcard = async (deckId: string, front: string, back: string): Promise<Flashcard>
export const updateFlashcard = async (flashcardId: string, front: string, back: string): Promise<Flashcard>
export const deleteFlashcard = async (flashcardId: string): Promise<void>
```

### 2. Navigation Update
**File:** `front/app/_layout.tsx`

- Replace current headerLeft (empty) with hamburger menu icon (IconSymbol "list.bullet")
- On press: toggle between "chats" and "flashcards" mode
- Show different list based on mode

### 3. Deck List Screen
**File:** `front/app/flashcards.tsx`

- FlatList of all flashcard decks
- Each item shows deck name, card count, and truncated description
- Tap deck to view/edit cards or start studying
- FAB to create new deck

### 4. Deck Detail/Edit Screen
**File:** `front/app/flashcards/deck.tsx`

- Header shows deck name (editable) and description
- FlatList of all flashcards in deck
- Each card shows truncated front text
- Tap card to edit
- FAB to add new card to deck
- "Study" button in header to start study mode

### 5. Flashcard Edit Modal/Screen
**File:** `front/app/flashcards/cardEdit.tsx` (or modal)

- Form with "Front" and "Back" text inputs
- Save/Cancel buttons
- Delete button if editing existing

### 6. Flashcard Study Screen
**File:** `front/app/flashcards/study.tsx`

- Accepts deckId parameter
- Display current card (front side)
- Tap card to flip (animate)
- Previous/Next buttons to navigate
- Progress indicator (e.g., "3 / 10")
- Exit button to return to deck

### 6. Chat Integration
**File:** `front/app/botChat.tsx`

- After sending message, check response for flashcard tool call results
- If bot created flashcards, show toast/notification: "X flashcards created"
- Store flashcard IDs in response for potential editing

---

## UI Specifications

### Deck List
```text
┌─────────────────────────────────────────┐
│ ←  My Decks                         │
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
│                           [+ Create Deck]│
└─────────────────────────────────────────┘
```

### Deck Detail
```text
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
```text
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
- `back/bots/models/chat.py` - Handle flashcard tool calls

### New Frontend Files
- `front/api/flashcards.ts` - API module for decks and cards
- `front/app/flashcards.tsx` - List of flashcard decks
- `front/app/flashcards/deck.tsx` - Deck detail with card list
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
5. Frontend: Create flashcard decks list screen
6. Frontend: Create deck detail screen with card list
7. Frontend: Create card edit screen
8. Frontend: Create study screen with flip animation
9. Frontend: Integrate flashcard creation in chat
10. Test and verify end-to-end flow