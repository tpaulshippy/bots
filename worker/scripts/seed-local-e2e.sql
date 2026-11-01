-- Local-D1 E2E seed for the Detox suite (front/e2e/*).
--
-- Loads ONLY the two E2E users (+ their accounts and a default AI model):
--   id 60  e2e-test-user    (parent; specs log in as username 'e2e-test-user')
--   id 61  e2e-teen-helper  (email maya@school.edu; GET /api/login mints
--                           teen-delegated tokens for this email when a profile
--                           owned by another user binds it as oauth_email)
--
-- Both passwords are 'testpassword123' in Django pbkdf2_sha256 format at a
-- cheap 10k-iteration work factor. Verification is iteration-agnostic
-- (see worker/src/crypto.ts verifyDjangoHash), so cheap hashes verify
-- exactly like Django-grade ones; 10k keeps `wrangler dev` logins fast.
-- Regenerate with:
--   node -e "const c=require('node:crypto');
--     const s=c.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,22);
--     process.stdout.write('pbkdf2_sha256\$10000\$'+s+'\$'+c.pbkdf2Sync('testpassword123',s,10000,32,'sha256').toString('base64')+'\n')"
--
-- Explicit ids 60/61 match the hardcoded user_id values in the D1-direct
-- helpers (front/e2e/seedHelpers.js deleteAllChatsD1 etc.).
--
-- Accounts are PIN-less (pin_hash NULL, zeroed lockout counters) with the
-- default subscription_level 0; specs set/clear the PIN via the API.
-- Profiles + bots are NOT seeded here — specs create them via the API
-- (ensureProfile / ensureBot in seedHelpers.js).
--
-- The single bots_aimodel row (is_default = 1) is required: bootstrap and
-- ensureBot attach new bots to the default model, and getDefaultModelId
-- reads it back. Model id us.amazon.nova-micro-v1:0 matches the Converse
-- client default family (worker/src/bedrock.ts).
--
-- Usage (Terminal 1 must already run `wrangler dev` once so local D1 exists):
--   cd worker && npx wrangler d1 execute syft-db --local --file=./scripts/seed-local-e2e.sql
-- Idempotent: safe to re-run (INSERT OR REPLACE / OR IGNORE).

INSERT OR REPLACE INTO auth_user (id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
VALUES
  (60, 'pbkdf2_sha256$10000$6WsxRJUeouaLspEo$tJ39t8OBwf/CeM9+7EZCU4d78HQC1fg9LaJGKzlpftE=', NULL, 0, 'e2e-test-user', '', '', '', 0, 1, '2026-01-01T00:00:00.000Z'),
  (61, 'pbkdf2_sha256$10000$JIxbxDiRRC9RlV2$S75p4gyd/16LTHOvPUdmlg6p/fEDTEaBBFdCcwB8tK8=', NULL, 0, 'e2e-teen-helper', '', '', 'maya@school.edu', 0, 1, '2026-01-01T00:00:00.000Z');

INSERT OR REPLACE INTO bots_useraccount (user_id, pin_hash, pin_failed_attempts, pin_locked_until, subscription_level, timezone, onboarding_completed_at)
VALUES
  (60, NULL, 0, NULL, 0, 'UTC', NULL),
  (61, NULL, 0, NULL, 0, 'UTC', NULL);

INSERT OR IGNORE INTO bots_aimodel (model_id, name, input_token_cost, output_token_cost, is_default, supported_input_modalities, created_at, modified_at)
VALUES ('us.amazon.nova-micro-v1:0', 'Nova Micro', 0.000035, 0.00014, 1, '["text"]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
