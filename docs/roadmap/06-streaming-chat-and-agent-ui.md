# 06 — Streaming Chat and Agent UI

## Problem

The core loop feels broken for a 2026 tutoring app:

- `ChatAgentService` uses blocking `model.invoke` — kid stares at a spinner until the full answer (and up to 5 tool iterations) finish
- No cancel — a bad prompt wastes quota
- Flashcard tools already create decks server-side; the client never shows “8 cards created → Study”
- Web search runs invisibly — no citations
- Send failure can leave a forever-loading bubble
- `katex` is in package.json unused; math answers are ugly plaintext
- Camera only; no library; no image preview in composer

## Success criteria

- Assistant tokens stream to the bubble as they arrive.
- User can cancel in-flight generation; partial text kept or discarded consistently.
- Tool activity is visible: searching… / creating flashcards… with a tappable “Study deck” card when done.
- Failed sends show retry; loading bubble never sticks forever.
- Composer supports library pick + preview + remove before send.
- Math in assistant markdown renders via KaTeX when delimited.

## Current code

| Piece | Path |
|-------|------|
| Chat POST | `back/bots/views/get_chat_response.py` — sync JSON `{response, chat_id}` |
| Agent | `back/bots/services/chat_agent.py` — `invoke` loop |
| Client send | `front/api/chats.ts`, `front/app/botChat.tsx` |
| Tools | flashcard deck/card, optional Tavily |
| Markdown | `front/components/MarkdownRenderer.tsx` |
| PLAN leftover | toast on flashcard create — never built |

---

## Backend

### 1. Streaming transport

Add **SSE** (preferred) or chunked NDJSON endpoint alongside existing POST for backward compatibility:

`POST /api/chats/<chat_id>/stream` (and `.../new/stream`)

Content-Type: `text/event-stream`

Event types:

```text
event: meta
data: {"chat_id":"...","message_id":"..."}

event: status
data: {"type":"tool_start","tool":"web_search","args":{"query":"..."}}

event: status
data: {"type":"tool_end","tool":"web_search","result_preview":"3 results"}

event: status
data: {"type":"tool_end","tool":"create_flashcard_deck","deck_id":"...","name":"...","card_count":8}

event: token
data: {"text":"Fractions "}

event: done
data: {"input_tokens":123,"output_tokens":456,"message_id":"..."}

event: error
data: {"code":"over_limit"|"safety"|"internal","message":"..."}
```

Keep legacy `POST /api/chats/<id>` returning final JSON for old app versions / tests until deprecated.

### 2. Model streaming

Use LangChain `model_with_tools.stream` / Bedrock streaming where supported.

Agent loop complexity:

- On tool_call chunks: buffer until tool call complete → execute tool → emit `status` → continue
- On text chunks of final answer: emit `token`
- Persist user message immediately; persist assistant message on `done` (or upsert partial on cancel)

**Cancel:** client closes SSE. Server catches disconnect, stops iteration, saves partial assistant message with `status=cancelled` optional field — or deletes partial. Prefer **save partial** so history matches what the kid saw.

### 3. Structured tool results in API

Today tools return plain strings to the model. Also accumulate a `client_events` list on the service for SSE `status` payloads with **IDs** the app can deep-link:

```python
{"tool": "create_flashcard_deck", "deck_id": "...", "name": "Biology", "card_count": 8}
```

Legacy JSON response gains optional:

```json
{
  "response": "...",
  "chat_id": "...",
  "events": [ { "type": "flashcard_deck_created", "deck_id": "...", "name": "...", "card_count": 8 } ]
}
```

so non-stream clients can still toast.

### 4. Quota and safety

- `over_limit()` before stream starts → single `error` event, no tokens
- Safety blocks (03) → `error` or final refusal tokens; still `done`

### 5. Token accounting

Sum usage from streamed metadata when Bedrock provides it; fallback estimate only if required — document accuracy limits.

---

## Frontend

### 1. Stream client

**File:** `front/api/chats.ts`

- `streamChatMessage({ chatId, message, image, profile, bot, onEvent, signal })`
- Use `fetch` + `ReadableStream` (works on modern RN / Expo); polyfill if needed
- `AbortController` for cancel button

### 2. botChat.tsx state machine

```
idle → sending → streaming (tokens) → tool_status → streaming → complete
                 ↘ error → retryable
                 ↘ aborted
```

- Replace forever spinner with growing assistant bubble
- Header or composer: Stop button while streaming
- On error: mark bubble failed, Retry action re-sends same payload
- On flashcard event: present toast/banner “8 cards in Biology” + button → `/flashcards/deck?deckId=`
- On web_search end: optional small “Sources used” chip under bubble (from result_preview or future citations array)

### 3. Composer media

- Image picker: camera **or** library (`launchImageLibraryAsync`)
- Thumbnail preview above text field with X to clear
- Existing S3 upload path unchanged

### 4. KaTeX

Wire `katex` in `MarkdownRenderer` for `$$...$$` and `$...$` (or code fence `math`). If RN WebView/KaTeX integration is too heavy, use a minimal math row component; **either use the dependency or remove it** in this feature — no more dead weight.

### 5. Haptics / a11y

Light haptic on tool_end flashcard create. Announce “Bot is typing” for VoiceOver during stream.

---

## UI

```text
┌─────────────────────────────────────────┐
│ Penelope                            [■] │  ← stop
├─────────────────────────────────────────┤
│ … prior messages …                      │
│                                         │
│ ┌─ assistant ─────────────────────────┐ │
│ │ 🔍 Searching: “mitosis stages”      │ │
│ │ 📇 Created “Cell Bio” · 8 cards     │ │
│ │                    [ Study now ]    │ │
│ │ Mitosis has four main stages. First │ │
│ │ prophase, when…█                    │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ [img✓] [                  ] [cam] [➤] │
└─────────────────────────────────────────┘
```

---

## Tests

- Backend: stream emits meta → tokens → done; tool_status includes deck_id
- Disconnect mid-stream saves partial (or documented discard)
- Legacy POST still returns full response + events[]
- over_limit error event
- Frontend: MSW stream fixture drives bubble text; abort called on Stop
- Flashcard banner navigates with deckId

## Implementation order

1. Accumulate `client_events` in agent (works for legacy + stream)
2. Legacy response `events[]` + frontend toast/Study CTA (**smallest delight win**)
3. SSE endpoint + Bedrock stream
4. Frontend stream client + Stop + error retry
5. Composer library + preview
6. KaTeX or remove dependency

## Non-goals

- Voice I/O (feature 10)
- Multi-agent graphs
- Editing prior messages / regenerating (nice follow-on)
- Websocket infra (SSE is enough)

## Depends on

- Stronger with **03** (safety events during stream)
- Flashcard Study CTA pairs with **07**
- No hard dependency on 01/02
