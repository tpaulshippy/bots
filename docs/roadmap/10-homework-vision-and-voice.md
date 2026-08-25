# 10 — Homework Vision and Voice

## Problem

The “photo a worksheet → get Socratic help” loop is half-built, and voice does not exist:

- Camera capture only; no library, weak composer preview (addressed partly in 06 — this feature goes further)
- Images go to vision models when modality allows, else fall back to default — kid gets no guidance that the model “can’t see”
- No worksheet-specific prompt mode (extract problem → guide steps → check work)
- Math rendering may land in 06; homework needs **structured** problem cards, not only KaTeX in prose
- No voice input/output — critical for younger kids and language practice
- Branch history shows past `nova-sonic` interest; nothing shipped

This is the capstone differentiator vs “another ChatGPT wrapper for kids.”

## Success criteria

- Kid can attach worksheet photos from camera **or** library, crop/rotate, and send with an explicit “Help with this homework” intent.
- Server runs a vision pipeline: understand problem, hide final answer by default, Socratic scaffolding, optional step check when kid submits work.
- Math and diagrams render cleanly in-chat.
- Voice mode: push-to-talk (STT) → same agent → optional TTS playback of assistant reply; parent toggle per bot/profile.
- Works within daily cost cap; vision/voice usage metered.
- Safety (03) applies to images and transcripts.

## Current code

| Piece | Path |
|-------|------|
| Image upload | `get_chat_response.py` — resize 800px JPEG → S3 |
| Modalities | `AiModel.supported_input_modalities` |
| Chat UI | `botChat.tsx` — camera only today |
| Markdown | `MarkdownRenderer.tsx` |
| Models fixture | Nova / Llama / Claude with image flags |
| Dead weight | `katex` dependency; `nova-sonic` remote branch legacy |

---

## Backend

### 1. Message intents

Add optional field on send (form field or JSON):

```text
intent = "chat" | "homework" | "check_work"   # default chat
```

Persist on `Message.intent` (nullable, default chat) for analytics and memory (08).

### 2. Homework system layer

When `intent=homework` (or `check_work`), inject server prompt block **after** safety, **in addition to** bot persona:

```text
HOMEWORK_MODE:
- Describe what you see on the page briefly.
- Identify the question(s) the student must answer.
- Do NOT give the final numeric/closed answer unless the student has tried and asks to check.
- Ask guiding questions; offer one hint at a time.
- If multiple problems, ask which number to start with.
- For check_work: compare student writing to correct approach; point out first error; celebrate partial credit.
```

Character bots keep voice but cannot override “no final answer spoon-feeding” in homework mode (safety-adjacent product rule).

### 3. Vision pipeline hardening

- If bot model lacks `image` modality, **auto-upgrade this turn** to account default vision-capable model (or first allowed vision model) rather than silent text-only fallback — log `model_override_reason=vision`.
- If no vision model available: clear error event, no charge for fake seeing.
- Optional two-step: (a) cheap vision extract → structured `problem_text` stored on message meta; (b) tutor model reasons on text + thumbnail. v1 can be single vision call; two-step is better for cost — prefer two-step if latency acceptable.

```python
class Message(models.Model):
    ...
    intent = models.CharField(max_length=16, default="chat")
    meta = models.JSONField(default=dict, blank=True)
    # meta: { problem_text, model_override, voice: true }
```

### 4. Multi-image (v1.5)

Allow up to 3 images per user message for multi-page worksheets. S3 keys list in meta. Start with 1 if scope tight; design API as array.

### 5. Voice: STT / TTS

**Speech-to-text**

- Client records audio (m4a/webm) → `POST /api/chats/<id>/voice` multipart
- Server: Amazon Transcribe streaming or Bedrock/Nova speech if available; fallback AWS Transcribe batch
- Result becomes `message.text` + `meta.voice_input=true`; then normal agent path (stream 06)

**Text-to-speech**

- `POST /api/tts/` with `{ text, voice_id }` → audio URL or stream
- Or return audio bytes from chat `done` event when `accept_audio=true`
- Prefer short replies in voice mode: inject “Keep spoken answers under 80 words unless asked.”

**Auth / cost**

- Bill estimated STT/TTS cost into daily cap (configure per-second rates in settings).
- Parent flags: `Bot.enable_voice`, `Profile.voice_enabled` (default off until parent opts in).

### 6. Safety on multimodal

- Run image through guardrail when configured (03).
- STT transcript through input filter before agent.
- TTS: do not speak blocked refusal details beyond fixed short line.

---

## Frontend

### 1. Homework composer mode

**File:** `botChat.tsx` + new `components/HomeworkComposer.tsx`

- Toggle chip: Chat | Homework
- Homework: larger attach target, crop UI (`expo-image-manipulator`), optional problem number text field
- After response, quick actions: “Hint”, “Check my work” (switches intent), “Make flashcards” (prompt suggestion)

### 2. Image UX (extends 06)

- Full-screen annotate-free preview before send
- Badge on bubble: worksheet thumbnail
- If server signals model couldn’t see: inline error “This tutor can’t view photos — ask a parent to enable a vision model”

### 3. Math / problem cards

- KaTeX in markdown (06)
- Optional structured block if model returns fenced ` ```problem ` JSON — render as card UI; degrade to markdown if parse fails

### 4. Voice mode UI

- Hold-to-talk button replacing keyboard when voice mode on
- Waveform while recording; slide-to-cancel
- Auto-play TTS toggle (default on in voice mode)
- Permission copy for mic in app.json / settings

### 5. Parent controls

- Bot editor: Enable voice, prefer vision model hint
- Profile: Allow voice
- Onboarding tip sheet once: “Photograph homework”

---

## UI

```text
┌─────────────────────────────────────────┐
│ Penelope          [Chat|Homework]   🎤  │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ [worksheet thumb]                   │ │
│ │ I see problem 3 on linear equations.│ │
│ │ What have you tried so far?         │ │
│ │ $ 2x + 5 = 17 $                     │ │
│ │ [ Hint ] [ Check my work ]          │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ [crop preview]  Help with #3…     [➤] │
│ 📷 🖼                              🎤   │
└─────────────────────────────────────────┘
```

Voice:

```text
│         ● recording 0:12               │
│         release to send · slide cancel │
```

---

## Tests

- homework intent injects HOMEWORK_MODE block (message spy)
- image + non-vision bot → override to vision model (fixture)
- no vision model → error, no invoke
- voice flag false → 403 on voice endpoint
- STT path creates user message text (mock transcribe)
- TTS requires parent-enabled bot
- safety block on transcript
- cost over_limit short-circuits before STT/LLM when already over

## Implementation order

1. `intent` field + homework prompt injection + vision model override
2. Frontend homework mode + crop + check-work CTA
3. Math/problem rendering polish
4. STT endpoint + hold-to-talk
5. TTS playback
6. Parent toggles + metering rates
7. Multi-image if time

## Non-goals

- Full real-time duplex voice agent (Nova Sonic-style) in v1 — turn-based PTT first
- Handwriting OCR accuracy guarantees
- Auto-scanning multi-page PDF books
- AR camera overlay

## Depends on

- **06** streaming + composer media baseline + KaTeX decision
- **03** multimodal safety
- **09** optional: only allow voice/homework bots on allowlist
- **08** memory can store “worked on linear equations worksheet”
- **02/01** parent toggles protected

## Why last

Needs streaming UX, safety, and parent controls to feel responsible. Shipping voice into an unsafe, parent-blind chat would be reckless. As the final feature of this wave it turns Syft into a complete homework companion: see the page, hear the kid, remember the struggle, drill the cards, and let parents review it all.
