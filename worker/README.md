# Syft API on Cloudflare Workers + D1

TypeScript port of the Django backend (`back/`) that runs on Cloudflare
Workers with D1 (SQLite) and R2. The Expo app (`front/`) talks to it with
**zero code changes** — every route, query param, `.json` format suffix,
response shape, and SSE frame the app uses is preserved.

## Layout

```
worker/
  src/index.ts        Hono app: /api/* routes, .json normalization, crons
  src/routes/         one module per Django viewset/views group
  src/agent.ts        chat agent loop (Bedrock Converse + tools), port of chat_agent.py
  src/chat.ts         turn orchestration (input refusal → quota → agent → persist)
  src/bedrock.ts      SigV4-signed Bedrock Converse client (replaces langchain_aws)
  src/safety.ts       denylists, policy, refusals, OpenAI guardrail (fail-closed)
  src/srs.ts          SM-2 scheduler (pure)
  src/stats.ts        kid stats / streaks
  src/usage.ts        token cost + daily quota (UsageLimitHit parity)
  src/onboarding.ts   atomic bootstrap wizard
  src/oauth.ts        Google/Apple OAuth code flow + ID-token verification
  src/pin.ts          parent PIN lifecycle (Django-compatible hashes)
  src/auth.ts         SimpleJWT-compatible HS256 sessions, teen delegation
  src/images.ts       R2 media + S3 fallback + signed URLs
  src/push.ts         Expo push (fire-and-forget)
  src/crypto.ts       JWT, Django pbkdf2 verification/hashing
  migrations/         D1 schema (mirrors Django tables/constraints)
  scripts/            sqlite → D1 dump
  tests/              vitest: pure logic + full HTTP integration (D1 shim)
```

## Quick start (local)

```bash
cd worker
npm install
npm test            # 40 tests, no network
npm run typecheck

# Local D1 like prod (dump from your pre-removal checkout or server backup —
# `back/` no longer lives in this repo, so copy `db.sqlite3` out first):
npx wrangler d1 execute syft-db --local --file=./migrations/0001_initial.sql
node scripts/migrate-from-sqlite.mjs /path/to/back/db.sqlite3 > /tmp/seed.sql
npx wrangler d1 execute syft-db --local --file=/tmp/seed.sql
npx wrangler dev   # serves http://localhost:8787
```

Point the app at it: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787/api`.

## Deploy

```bash
npx wrangler d1 create syft-db        # put the id in wrangler.toml
npx wrangler r2 bucket create syft-images
npx wrangler d1 execute syft-db --remote --file=./migrations/0001_initial.sql
# One-time seed from the Django database (copy db.sqlite3 from your server
# or pre-removal checkout first — back/ is gone from this repo):
node scripts/migrate-from-sqlite.mjs /path/to/back/db.sqlite3 > /tmp/seed.sql
npx wrangler d1 execute syft-db --remote --file=/tmp/seed.sql
npx wrangler secret put JWT_SECRET    # MUST equal Django SECRET_KEY for cutover
# …then every secret listed in wrangler.toml…
npx wrangler deploy
```

Cutover is a config change: set the app's `EXPO_PUBLIC_API_BASE_URL` to
`https://<worker>/api`. Roll back by pointing it at Django again — tokens
issued by either side verify on both while the secrets match. Note the data
caveat: writes made on the Worker after cutover live in D1 and will NOT
appear in Django's database, so a rollback hides post-cutover data and the
two stores diverge. Roll back only for auth compatibility; post-cutover
Worker data must be reconciled or accepted as lost.

Crons (`wrangler.toml [triggers]`) send study reminders + parent digests.
R2 holds new uploads; pre-cutover S3 keys keep working via the S3 fallback
until you sync the bucket (`aws s3 sync s3://old s3://new --endpoint-url …`
or `rclone`), keys are preserved 1:1.

## Secrets

| Secret | Notes |
|---|---|
| `JWT_SECRET` | = Django `SECRET_KEY` for token cross-compat |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Bedrock (+ S3 fallback) |
| `TAVILY_API_KEY` | empty = web_search tool disabled (same as Django) |
| `OPENAI_API_KEY` | empty = denylist-only safety (same as Django) |
| `GOOGLE_OAUTH_CLIENT_ID` (+ `_SECRET`), `APPLE_*` | OAuth web flow + native verify |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | webhook shared secret |
| `RESEND_API_KEY`, `EMAIL_RECIPIENT` | support form (logs if unset) |

## Intentional deviations from Django

- **No session auth / admin / marketing pages.** The mobile app only sends
  Bearer JWTs; Django admin and the marketing site stay where they are.
- **OAuth without allauth.** Same frontend URLs (`/api/login/web`,
  `/api/accounts/{google,apple}/auto-login/`, callbacks), but the Worker
  drives the provider code flow directly and mints the same teen-aware
  token pairs. Added `POST /api/auth/google|apple` for native ID tokens
  (future use; web flow is unchanged).
- **Streaming is buffered.** SSE frames are byte-identical, but token frames
  are emitted after the turn completes instead of mid-generation (Bedrock
  `converse-stream` eventstream parsing is a follow-up).
- **No prompt-caching `cachePoint`s and no image downscaling.** Cost/latency
  follow-ups; originals are stored as-is (20MB/ext gate kept).
- **`preview_page` tool is not bound** (no headless browser in Workers —
  same as Django with `render_available() == False`).
- **No Playwright render gate**, so tool-time HTML checks are static only
  (same validator + text extraction as Django).
- **PIN/password hashing stays Django-format** (`pbkdf2_sha256` / `pbkdf2_sha1`;
  argon2/bcrypt hashes from non-default Django configs are NOT supported —
  Django's default is PBKDF2, and any Django-produced PBKDF2 hash verifies
  as-is). New PIN hashes use a low work factor on purpose (see `pin.ts`): a 4–8 digit PIN can't survive an offline attack
  regardless of iterations, so the real control is server-side lockout — and
  sub-millisecond verification keeps everything inside the free plan's 10ms
  CPU budget. If your account still has a pre-cutover PIN set, remove it in
  the app before cutover (legacy high-iteration hashes verify but cost
  ~200ms of CPU).
- **`/api/schema`, `/api/docs`, browsable `api-auth/` are gone.**
  `front/api/schema.yaml` remains the shape reference; route tests assert
  the wire contract instead.
- **Push-notification triggers** fire on chat/message creation via
  `waitUntil` (same recipients as the Django signals).

## Verification

- `npm test` — 40 tests: safety denylists/refusals/moderation mapping,
  SM-2, HTML validator, JWT + Django-hash compat, and end-to-end HTTP
  (auth, bots, profiles, teen scoping, decks/flashcards/reviews, stats,
  activity, PIN/reauth gating, chat turns + SSE against the deterministic
  fake model, signed media URLs, RevenueCat mapping).
- Migration verified against the real `back/db.sqlite3`: schema + dump
  apply cleanly, row counts match, no orphan messages, datetimes normalized;
  a production Django password hash verifies in the Worker.
