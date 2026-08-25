# Syft Learning — Product Roadmap

Ambitious next-wave features for a parent-controlled AI tutoring app that already has: OAuth parent accounts, kid profiles, customizable bots (Bedrock), chat + images, Tavily web search, flashcard CRUD + bot tools, RevenueCat quotas, Expo push, and a PIN-gated parent area.

These plans assume **flashcards v1 is shipped** (`PLAN_FLASHCARDS.md`). They do **not** redo that work. They close the holes that keep Syft from being a complete family product: kids cannot log in as themselves, safety is prompt-only, parents cannot review conversations, study is a flip-through, chat blocks until the full answer arrives, and a new parent can hit “select a profile first.”

## Sequence

Ship in this order. Later features depend on earlier ones.

| # | Feature | Why this order |
|---|---------|----------------|
| 01 | [Teen delegated login](01-teen-delegated-login.md) | Half-built (`Profile.oauth_email`, `get_delegated_tokens`). Unlocks a real two-device family model. |
| 02 | [PIN security and reauth](02-pin-security-and-reauth.md) | Required once teens and parents share a household. The app already calls a missing `/auth/reauthenticate`. |
| 03 | [Server-side safety](03-server-side-safety.md) | Marketing already claims filters. Safety flags today live only in client-built prompts. |
| 04 | [Parent conversation review](04-parent-conversation-review.md) | Notifications exist; a parent inbox does not. Safety without visibility is theater. |
| 05 | [Onboarding and profile switcher](05-onboarding-and-profile-switcher.md) | New accounts can chat with no profile selected. First-run is the conversion leak. |
| 06 | [Streaming chat and agent UI](06-streaming-chat-and-agent-ui.md) | Core loop quality. Flashcard tools already run; the kid never sees them happen. |
| 07 | [Spaced repetition study](07-spaced-repetition-study.md) | Turns decks into a learning system. Needs the chat → deck toast from 06. |
| 08 | [Adaptive tutoring memory](08-adaptive-tutoring-memory.md) | 10-message window is the tutoring ceiling. Needs profiles + review + study data. |
| 09 | [Per-profile access and schedules](09-per-profile-access-and-schedules.md) | All bots are global. Family control is incomplete without allowlists and hours. |
| 10 | [Homework vision and voice](10-homework-vision-and-voice.md) | Camera exists; library, worksheet pipeline, KaTeX, and voice do not. Capstone. |

## Success bar for the whole wave

A parent can:

1. Invite a teen by email; the teen signs in with their own Google/Apple account and never sees Settings.
2. Trust that PIN, JWT claims, and server-side filters — not a prompt suffix — keep the teen out of parent controls and unsafe content.
3. Open a parent inbox, read transcripts, get a nightly digest, and jump into a flagged chat.
4. Finish first-run in under three minutes: kid name, first bot, PIN, notifications.
5. Watch answers stream, see “8 biology cards created → Study,” and cancel a runaway reply.
6. Have the kid study with Again/Hard/Good/Easy and actually retain the cards.
7. Know the tutor remembers last week’s fractions struggle and today’s due cards.
8. Restrict which bots each kid can use, and when.
9. Photograph a worksheet or talk out loud to a tutor that renders math.

## Non-goals for this wave

- Extra IAP tiers or annual plans (quota copy is enough until entitlements mean something).
- Design-system rewrite / NativeWind.
- Multi-parent / teacher orgs (call it out in 09 as a follow-on).
- Android store launch as a product feature (keep building universal; do not block on Play).
- Rewriting flashcards CRUD.

## How to use these files

Each file is an implementation plan in the same shape as `PLAN_FLASHCARDS.md`:

- Product problem and success criteria
- Data model and API contracts
- Backend and frontend file-level work
- UI wireframes
- Permissions / safety / test plan
- Implementation order
- Explicit non-goals

Touch only the files listed. Do not “improve” adjacent screens while building a feature.
