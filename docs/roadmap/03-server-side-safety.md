# 03 — Server-Side Safety Layer

## Problem

Marketing and tutorial copy promise content filters and “high safety.” Reality:

- `restrict_language` and `restrict_adult_topics` are **boolean fields on Bot** that the **client** turns into prompt suffixes in `front/api/botTemplates.ts`
- Advanced editor lets a parent (or compromised client) save any `system_prompt` with those flags ignored
- Default system prompt if bot has none is a soft “you are chatting with a teen…” line
- Tavily `web_search` returns unfiltered titles/snippets
- Assistant markdown links open with `Linking.openURL` — no allowlist
- No classifier, blocklist, or output filter on the server
- No audit log when something is blocked

Prompt-only safety is not safety. A jailbreak, tool result, or missing suffix bypasses the product promise.

## Success criteria

- Every chat completion path applies a **server-owned** safety policy derived from the bot flags + a global floor for all teen traffic.
- Flags are enforced even when `simple_editor=false` and the parent wrote a custom prompt.
- Web search queries and results pass through the same policy (block or redact).
- Clear user-visible refusal when blocked; parent can see block events (feeds feature 04).
- No reliance on the mobile client for policy text.

## Current code

| Piece | Path |
|-------|------|
| Bot flags | `back/bots/models/bot.py` — `restrict_language`, `restrict_adult_topics`, `enable_web_search` |
| Prompt build (client) | `front/api/botTemplates.ts` — `generateSystemPrompt` |
| Chat path | `back/bots/models/chat.py` — `get_response()` |
| Agent | `back/bots/services/chat_agent.py` — tools + loop |
| Web search | Tavily in `chat_agent.py` |
| Default prompt | `chat.py` when bot prompt empty |

---

## Design principles

1. **Global floor** — always on for every message (CSAM, self-harm crisis redirect, extreme violence, etc.). Not parent-disableable.
2. **Bot policy** — language + adult-topics flags tighten the floor; they never loosen it.
3. **Defense in depth** — system prompt instructions **and** pre/post filters **and** tool filters.
4. **Fail closed** on classifier errors for the global floor; fail open only for soft “tone” checks if the vendor is down (document the choice).

---

## Backend

### 1. `SafetyPolicy` value object

**File:** `back/bots/services/safety.py` (new)

```python
@dataclass(frozen=True)
class SafetyPolicy:
    restrict_language: bool
    restrict_adult_topics: bool
    enable_web_search: bool
    # always True in v1
    global_floor: bool = True

    @classmethod
    def for_bot(cls, bot: Bot | None) -> "SafetyPolicy":
        if bot is None:
            return cls(True, True, False)
        return cls(
            restrict_language=bool(bot.restrict_language),
            restrict_adult_topics=bool(bot.restrict_adult_topics),
            enable_web_search=bool(bot.enable_web_search),
        )
```

### 2. Server-owned system prompt layers

In `get_response()` / agent setup, build messages as:

```text
[system] GLOBAL_SAFETY_PREAMBLE          # server constant, always first
[system] bot.system_prompt               # parent customization
[system] POLICY_SUFFIX(policy)           # server regenerates from flags every turn
[history...]
[user] message
```

`POLICY_SUFFIX` restates language/adult rules and Socratic tutoring norms. **Do not trust** that the client-built `system_prompt` already contains them. Advanced editor content stays, but cannot strip the preamble/suffix.

Move the strings currently in `botTemplates.ts` safety append into the server module so simple and advanced paths converge. Client may still append for preview in the editor UI only.

### 3. Input filter (pre-model)

Before LLM / tools:

- Normalize text; run lightweight denylist for obvious sexual/violent terms when `restrict_adult_topics` (configurable list in code or fixture, not parent-editable).
- Optional: call a cheap Bedrock guardrail or moderation API if `BEDROCK_GUARDRAIL_ID` / vendor key set; feature-flagged.
- On block: do **not** call the model. Persist assistant message with a fixed refusal template. Write `SafetyEvent`.

Image inputs: if vision model, run the same policy on any extracted text later; v1 at least rejects known-bad MIME and oversized files (already partly done). Optional: Amazon Bedrock image guardrails when available.

### 4. Output filter (post-model)

After final assistant text, before save/return:

- Same denylist / guardrail on output.
- If flagged: replace with refusal template; log `SafetyEvent` with `stage=output`.
- Strip or rewrite raw URLs if policy disallows external links (see frontend coordination).

### 5. Tool filters

**`web_search`**

- If `not policy.enable_web_search`: tool not bound (already) **and** if model hallucinates a call, return `"Web search is not available."` (already).
- Pre-query: run query through input filter; block high-risk queries.
- Post-results: drop results whose title/snippet fail filter; if all dropped, tool returns “No safe results found.”
- Cap snippet length (already ~200 chars) — keep.

**Flashcard tools**

- Run front/back text through output-style filter before save; reject card creation with tool error string if blocked so the model can apologize without storing junk.

### 6. `SafetyEvent` model

```python
class SafetyEvent(models.Model):
    event_id = models.UUIDField(default=uuid.uuid4, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    profile = models.ForeignKey(Profile, null=True, on_delete=models.SET_NULL)
    chat = models.ForeignKey(Chat, null=True, on_delete=models.SET_NULL)
    bot = models.ForeignKey(Bot, null=True, on_delete=models.SET_NULL)
    stage = models.CharField(max_length=32)  # input|output|web_query|web_result|tool_flashcard
    reason_code = models.CharField(max_length=64)  # adult_topic|language|global_floor|web_blocked
    snippet_redacted = models.CharField(max_length=200, blank=True)  # never store full raw if sexual
    created_at = models.DateTimeField(auto_now_add=True)
```

Admin-readable. API for parents in feature 04.

### 7. Refusal copy

Fixed, age-appropriate strings — not model-generated:

- Adult topics: redirect to trusted adult / school counselor as appropriate.
- Language: ask to rephrase.
- Crisis / self-harm (global floor): short supportive message + encourage talking to a trusted adult / local resources; do **not** play therapist. Keep legal/review sign-off as a checklist item before ship.

### 8. Advanced editor honesty

When parent turns flags off, server policy loosens **only** those dimensions; global floor remains. UI copy in bot editor: “Syft always applies baseline safety. These toggles add extra limits.”

---

## Frontend

### 1. Editor copy, not enforcement

Keep toggles. Stop pretending client prompt text is the control plane. Show baseline safety note on simple + advanced editors.

### 2. Link handling

**File:** `front/components/MarkdownRenderer.tsx`

- On link press: if teen session (or always for kid chat UI), open an in-app confirm sheet showing the domain; optional parent setting `allow_outbound_links` later.
- v1 minimum: confirm dialog “Open example.com?” before `Linking.openURL`.

### 3. Surface refusals

Refusals are normal assistant messages — no special UI required. Optional subtle shield icon if `message.meta.safety_refusal` is ever added; not required for v1.

---

## Tests

- Bot with `restrict_adult_topics=True` and empty/custom prompt still gets POLICY_SUFFIX (assert message list or spy on safety module).
- Input denylist blocks without calling Bedrock (mock ai client not invoked).
- Output filter replaces bad completion.
- Web search disabled: tool absent; enabled: bad query blocked; bad result stripped.
- Flashcard tool rejects unsafe front/back.
- `SafetyEvent` rows created with correct stage/reason.
- Flags false still apply global floor fixture cases.

## Implementation order

1. `safety.py` policy + preamble/suffix injection in chat path
2. `SafetyEvent` model + admin
3. Input/output denylist
4. Tool filters for web + flashcards
5. Optional Bedrock guardrail behind env flag
6. Frontend link confirm + editor copy
7. Tests

## Non-goals

- Perfect jailbreak immunity (state residual risk)
- Parent-custom blocklists v1
- Real-time human moderation queue
- Replacing RevenueCat / auth work

## Depends on

- None strictly. Feeds **04** (events + inbox). Stronger with **01** (know teen vs parent session for link UX).
