/**
 * Shared Detox E2E helpers — REST + D1-direct seeding against the API.
 *
 * RUNNING THE SUITE LOCALLY (local Worker + local D1, no Django):
 *   Terminal 1:  cd worker && npx wrangler dev
 *                (first time: create worker/.dev.vars with
 *                 JWT_SECRET="local-dev-only-secret-not-for-prod"
 *                 — gitignored, never committed — then
 *                 `npx wrangler d1 migrations apply syft-db --local` and
 *                 `npx wrangler d1 execute syft-db --local
 *                    --file=./scripts/seed-local-e2e.sql`)
 *   Terminal 2:  API_BASE_URL=http://127.0.0.1:8787/api npx detox test -c ios.sim.debug <spec>
 *
 * Base selection (API_BASE_URL, default http://localhost:8000/api):
 *   - local Worker  (127.0.0.1/localhost port 8787): REST helpers hit the
 *     dev server; D1-direct helpers shell out to
 *     `npx wrangler d1 execute syft-db --local --command=<sql>` (cwd worker/).
 *   - prod Worker   (*.workers.dev): REST helpers hit the deployed Worker;
 *     D1-direct helpers use the Cloudflare D1 REST API (needs
 *     CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID env).
 *   - Django        (localhost:8000): REST helpers work as before; D1-direct
 *     helpers throw with the Django seed-command hint (D1 doesn't exist
 *     there — run the matching `seed_e2e_*` management command instead).
 *
 * E2E users (worker/scripts/seed-local-e2e.sql, explicit ids to match the
 * hardcoded D1 SQL below): id 60 'e2e-test-user' (parent) and id 61
 * 'e2e-teen-helper' (email maya@school.edu). Password for both:
 * 'testpassword123'. Tests set/clear the parent PIN via the API.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const WORKER_DIR = path.join(__dirname, '..', '..', 'worker');

// Hardcoded E2E user ids — must match worker/scripts/seed-local-e2e.sql.
const E2E_PARENT_ID = 60;
const E2E_HELPER_ID = 61;

const E2E_USERNAME = 'e2e-test-user';
const E2E_HELPER_USERNAME = 'e2e-teen-helper';
const E2E_PASSWORD = 'testpassword123';

// Prod D1 coordinates for the workers.dev REST path.
const D1_DATABASE_ID = '775870d2-6ec0-46f2-8775-a9c9a9ca09b8';

// ---------------------------------------------------------------------------
// Base helpers
// ---------------------------------------------------------------------------

function apiBase() {
  return (process.env.API_BASE_URL || 'http://localhost:8000/api').replace(/\/+$/, '');
}

function isLocalWorkerBase(base = apiBase()) {
  return /(127\.0\.0\.1|localhost):8787/.test(base);
}

function isWorkersDevBase(base = apiBase()) {
  return /workers\.dev/.test(base);
}

// True for any Worker base (local wrangler dev OR *.workers.dev) as opposed
// to the Django dev server.
function isWorkerBase(base = apiBase()) {
  return isLocalWorkerBase(base) || isWorkersDevBase(base);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function check(cond, msg) {
  if (!cond) throw new Error(msg || 'e2e check failed');
}

function uuid() {
  const { randomUUID } = require('crypto');
  return randomUUID();
}

// ---------------------------------------------------------------------------
// REST helpers (work against Django, local Worker, and workers.dev)
// ---------------------------------------------------------------------------

async function authed(accessToken, endpoint, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const init = { method, headers: { Authorization: `Bearer ${accessToken}`, ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${apiBase()}${endpoint}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${endpoint} -> ${res.status} ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getTokensFor(username, password) {
  const base = apiBase();
  const res = await fetch(`${base}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      `Backend not available at ${base} (or E2E seed missing). Status: ${res.status}. ` +
        `Django: run the suite's seed_e2e_* command. Worker: run worker/scripts/seed-local-e2e.sql.`,
    );
  }
  const data = await res.json();
  return { access: data.access, refresh: data.refresh };
}

function getParentTokens() {
  return getTokensFor(E2E_USERNAME, E2E_PASSWORD);
}

function getHelperTokens() {
  return getTokensFor(E2E_HELPER_USERNAME, E2E_PASSWORD);
}

async function getAccount(accessToken) {
  return authed(accessToken, '/user?timezone=UTC');
}

async function listProfiles(accessToken) {
  const data = await authed(accessToken, '/profiles.json');
  return data.results;
}

async function listBots(accessToken) {
  const data = await authed(accessToken, '/bots.json');
  return data.results;
}

// Exchange a parent PIN for a short-lived parent session token (sent back as
// the X-Parent-Reauth header on parent-gated writes).
async function reauth(accessToken, pin) {
  const data = await authed(accessToken, '/auth/reauthenticate', {
    method: 'POST',
    body: { pin },
  });
  return data.parentSessionToken;
}

function parentHeaders(parentToken) {
  return parentToken ? { 'X-Parent-Reauth': parentToken } : {};
}

// Retry a parent-gated write once after reauthenticating when the server
// demands parent reauth and a PIN was supplied.
async function withParentReauth(accessToken, pin, fn) {
  try {
    return await fn(null);
  } catch (err) {
    if (!pin || !/Parent reauthentication required/.test(err.message)) throw err;
    const parentToken = await reauth(accessToken, pin);
    return fn(parentToken);
  }
}

// Remove the parent PIN if one is set (needs the current PIN for reauth +
// verification).
async function ensureNoPin(accessToken, currentPin = '1234') {
  const account = await getAccount(accessToken);
  if (!account.hasPin) return account;
  const parentToken = await reauth(accessToken, currentPin);
  await authed(accessToken, '/user/pin', {
    method: 'DELETE',
    headers: parentHeaders(parentToken),
    body: { currentPin },
  });
  return getAccount(accessToken);
}

// Set the parent PIN, clearing a different existing PIN first. When a PIN is
// already set and currentPin is omitted, the existing PIN is assumed correct
// and nothing is changed. When currentPin IS supplied, the existing PIN is
// always cleared (verifying currentPin) and `pin` is set fresh, so the
// resulting PIN is guaranteed to equal `pin` even if a previous run left a
// different one.
async function ensurePin(accessToken, pin = '1234', currentPin) {
  const account = await getAccount(accessToken);
  if (account.hasPin) {
    if (!currentPin) return account;
    await ensureNoPin(accessToken, currentPin);
  }
  await authed(accessToken, '/user', { method: 'POST', body: { pin } });
  return getAccount(accessToken);
}

function completeOnboarding(accessToken) {
  return authed(accessToken, '/user/onboarding/complete', { method: 'POST' });
}

async function getDefaultModelId(accessToken) {
  const data = await authed(accessToken, '/ai_models.json');
  const def = (data.results || []).find((m) => m.is_default);
  check(def, 'No default AI model found (seed-local-e2e.sql seeds one)');
  return def.model_id;
}

async function ensureProfile(accessToken, name, opts = {}) {
  const { email = null, pin = null } = opts;
  const profiles = await listProfiles(accessToken);
  const found = profiles.find((p) => p.name === name);
  if (found) {
    if (email !== null && (found.oauth_email || '').toLowerCase() !== String(email).toLowerCase()) {
      const updated = await withParentReauth(accessToken, pin, (parentToken) =>
        authed(accessToken, `/profiles/${found.profile_id}/`, {
          method: 'PATCH',
          headers: parentHeaders(parentToken),
          body: { oauth_email: email },
        }),
      );
      return updated;
    }
    return found;
  }
  return withParentReauth(accessToken, pin, (parentToken) =>
    authed(accessToken, '/profiles/', {
      method: 'POST',
      headers: parentHeaders(parentToken),
      body: { name, oauth_email: email },
    }),
  );
}

// Rename the profile currently called fromName to toName (05-onboarding flow:
// seed profile 'Jordan' becomes the wizard-entered kid name).
async function ensureProfileByRename(accessToken, fromName, toName, opts = {}) {
  const { pin = null } = opts;
  const profiles = await listProfiles(accessToken);
  if (profiles.some((p) => p.name === toName)) {
    return profiles.find((p) => p.name === toName);
  }
  const found = profiles.find((p) => p.name === fromName);
  check(found, `ensureProfileByRename: no profile named '${fromName}'`);
  return withParentReauth(accessToken, pin, (parentToken) =>
    authed(accessToken, `/profiles/${found.profile_id}/`, {
      method: 'PATCH',
      headers: parentHeaders(parentToken),
      body: { name: toName },
    }),
  );
}

async function ensureBot(accessToken, name, opts = {}) {
  const { pin = null, params = {} } = opts;
  const bots = await listBots(accessToken);
  const found = bots.find((b) => b.name === name);
  // PATCH the existing bot so requested params (e.g. ai_model after a
  // re-seed) always apply — otherwise reruns drift (image-model mismatch).
  if (found) {
    if (Object.keys(params).length === 0) return found;
    const key = found.bot_id || found.id;
    return withParentReauth(accessToken, pin, (parentToken) =>
      authed(accessToken, `/bots/${key}/`, {
        method: 'PATCH',
        headers: parentHeaders(parentToken),
        body: params,
      }),
    );
  }
  return withParentReauth(accessToken, pin, (parentToken) =>
    authed(accessToken, '/bots/', {
      method: 'POST',
      headers: parentHeaders(parentToken),
      body: { name, ...params },
    }),
  );
}

// Delete every bot except keepNames (parent-gated when a PIN is set).
async function deleteExtraBots(accessToken, keepNames = [], opts = {}) {
  const { pin = null } = opts;
  const bots = await listBots(accessToken);
  const doomed = bots.filter((b) => !keepNames.includes(b.name));
  for (const b of doomed) {
    const key = b.bot_id || b.id;
    await withParentReauth(accessToken, pin, (parentToken) =>
      authed(accessToken, `/bots/${key}/`, {
        method: 'DELETE',
        headers: parentHeaders(parentToken),
      }),
    );
  }
  return doomed.length;
}

// Delete every profile except keepNames (parent-gated when a PIN is set).
async function deleteExtraProfiles(accessToken, keepNames = [], opts = {}) {
  const { pin = null } = opts;
  const profiles = await listProfiles(accessToken);
  const doomed = profiles.filter((p) => !keepNames.includes(p.name));
  for (const p of doomed) {
    const key = p.profile_id || p.id;
    await withParentReauth(accessToken, pin, (parentToken) =>
      authed(accessToken, `/profiles/${key}/`, {
        method: 'DELETE',
        headers: parentHeaders(parentToken),
      }),
    );
  }
  return doomed.length;
}

// ---------------------------------------------------------------------------
// D1-direct helpers (Worker bases only; Django bases throw with a hint)
// ---------------------------------------------------------------------------

function escapeLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function bindParams(sql, params) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    if (i >= params.length) throw new Error('d1: not enough params for SQL placeholders');
    return escapeLit(params[i++]);
  });
}

function d1Local(sql) {
  const out = execSync(
    `npx wrangler d1 execute syft-db --local --json --command=${JSON.stringify(sql)}`,
    { cwd: WORKER_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(out);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  // Return the rows of the last statement (multi-statement batches return
  // one result object per statement).
  const last = batches[batches.length - 1];
  if (!last.success) throw new Error(`d1 local execute failed: ${out.slice(0, 500)}`);
  return last.results || [];
}

async function d1Cloudflare(sql) {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKER_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      'd1: workers.dev base needs CLOUDFLARE_API_TOKEN (or CLOUDFLARE_WORKER_API_TOKEN) + CLOUDFLARE_ACCOUNT_ID env vars ' +
        '(or run against local `wrangler dev` with API_BASE_URL=http://127.0.0.1:8787/api)',
    );
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    },
  );
  if (!res.ok) throw new Error(`d1: Cloudflare D1 REST -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.success) throw new Error(`d1: Cloudflare D1 query failed: ${JSON.stringify(data.errors).slice(0, 300)}`);
  const last = data.result[data.result.length - 1];
  return (last && last.results) || [];
}

// Run raw SQL against D1 and return the rows of the last statement.
// `?` placeholders are bound from params (numbers/strings/null only).
// Local Worker base -> `wrangler d1 execute --local`; workers.dev base ->
// Cloudflare D1 REST API; Django base -> throws with the Django seed hint.
async function d1(sql, params = []) {
  const base = apiBase();
  const bound = bindParams(sql, params);
  if (isLocalWorkerBase(base)) return d1Local(bound);
  if (isWorkersDevBase(base)) return d1Cloudflare(bound);
  throw new Error(
    `d1: no D1 behind Django base ${base}. Run the suite's seed_e2e_* management ` +
      `command instead, or point API_BASE_URL at a Worker (local: http://127.0.0.1:8787/api).`,
  );
}

// Clear PIN failure counters + lockout (does NOT change the PIN itself).
function resetPinLockoutState(userId = E2E_PARENT_ID) {
  return d1('UPDATE bots_useraccount SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE user_id = ?', [
    userId,
  ]);
}

// Wipe chats/messages for a user (FK-safe order: messages first).
function deleteAllChatsD1(userId = E2E_PARENT_ID) {
  return d1(
    `DELETE FROM bots_message WHERE chat_id IN (SELECT id FROM bots_chat WHERE user_id = ?); ` +
      `DELETE FROM bots_chat WHERE user_id = ?`,
    [userId, userId],
  );
}

function ensureSubscriptionLevel(level, userId = E2E_PARENT_ID) {
  return d1('UPDATE bots_useraccount SET subscription_level = ? WHERE user_id = ?', [level, userId]);
}

// ---------------------------------------------------------------------------
// Usage-baseline reset (Worker D1 only; mirrors worker/src/usage.ts
// resetDailyUsage so cost_for_today restarts at zero). The seeded model
// rates make one heavy E2E turn (06's 500-word + deck reply ≈ $0.51)
// exceed even the level-2 daily cap ($0.161), so model-heavy specs reset
// before sending — otherwise later turns get OVER_LIMIT_MESSAGE instead of
// a stream and the Stop/cancel assertions can never observe streaming.
// (Django bases throw the d1 hint; the seed command owns quota there.)
// ---------------------------------------------------------------------------

// Port of worker startOfTodayUtc (Intl-based; Workers have no pytz).
function startOfTodayUtc(timezone, now = new Date()) {
  const tz = timezone || 'UTC';
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '01';
  const asUtcGuess = Date.parse(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
  const offFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const oparts = offFmt.formatToParts(new Date(asUtcGuess));
  const oget = (t) => oparts.find((p) => p.type === t)?.value ?? '00';
  const asIfUtc = Date.parse(
    `${oget('year')}-${oget('month')}-${oget('day')}T${oget('hour') === '24' ? '00' : oget('hour')}:${oget('minute')}:${oget('second')}Z`
  );
  const offsetMs = asIfUtc - asUtcGuess;
  return new Date(asUtcGuess - offsetMs);
}

async function resetDailyUsageD1(userId = E2E_PARENT_ID) {
  const acct = await d1('SELECT timezone FROM bots_useraccount WHERE user_id = ?', [userId]);
  check(acct.length > 0, `resetDailyUsageD1: no useraccount for user ${userId}`);
  const timezone = acct[0].timezone || 'UTC';
  const now = new Date();
  const resetAt = now.toISOString();
  const startIso = startOfTodayUtc(timezone, now).toISOString();

  const models = await d1('SELECT model_id, input_token_cost, output_token_cost, is_default FROM bots_aimodel');
  const byId = new Map(models.map((m) => [m.model_id, m]));
  const def = models.find((m) => m.is_default === 1) || null;
  const price = (mid) => {
    const m = (mid && byId.get(mid)) || def;
    if (!m) return [0, 0];
    return [m.input_token_cost, m.output_token_cost];
  };

  // Raw cost in [startIso, resetAt), bucketed by effective model exactly
  // like worker messageBucketsToday (stamp, else live bot model).
  const buckets = await d1(
    `SELECT CASE WHEN m.model_id IS NULL OR m.model_id = '' THEN am.model_id ELSE m.model_id END AS effective_model, COALESCE(SUM(m.input_tokens), 0) AS total_in, COALESCE(SUM(m.output_tokens), 0) AS total_out FROM bots_message m JOIN bots_chat c ON c.id = m.chat_id LEFT JOIN bots_bot b ON b.id = c.bot_id LEFT JOIN bots_aimodel am ON am.id = b.ai_model_id WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ? GROUP BY effective_model`,
    [userId, startIso, resetAt]
  );
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of buckets) {
    const [ri, ro] = price(r.effective_model || null);
    total += (r.total_in || 0) * ri + (r.total_out || 0) * ro;
    inputTokens += r.total_in || 0;
    outputTokens += r.total_out || 0;
  }

  // Pricing snapshot over [startIso, resetAt), mirroring worker
  // baselinePricingSnapshot. Serialized with sorted keys + compact
  // separators to match worker canonicalJson (the worker voids the
  // baseline when the stored snapshot differs from live).
  const stampedRows = await d1(
    `SELECT DISTINCT m.model_id AS mid FROM bots_message m JOIN bots_chat c ON c.id = m.chat_id WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ? AND m.model_id IS NOT NULL AND m.model_id != ''`,
    [userId, startIso, resetAt]
  );
  const unstampedRows = await d1(
    `SELECT DISTINCT c.id AS chat_id, am.model_id AS mid FROM bots_message m JOIN bots_chat c ON c.id = m.chat_id LEFT JOIN bots_bot b ON b.id = c.bot_id LEFT JOIN bots_aimodel am ON am.id = b.ai_model_id WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ? AND (m.model_id IS NULL OR m.model_id = '')`,
    [userId, startIso, resetAt]
  );
  const stampedIds = [...new Set(stampedRows.map((r) => r.mid))];
  const unstamped = {};
  for (const r of unstampedRows) unstamped[String(r.chat_id)] = r.mid;
  const mids = [...stampedIds, ...Object.values(unstamped).filter((m) => m !== null)];
  const fallbackUsed = [...stampedIds, ...Object.values(unstamped)].some((m) => m === null || !(m && byId.has(m)));
  const priced = new Set(mids.filter((m) => m !== null));
  if (fallbackUsed && def) priced.add(def.model_id);
  const rates = {};
  for (const mid of [...priced].sort()) {
    if (byId.has(mid)) {
      const m = byId.get(mid);
      rates[mid] = [m.input_token_cost, m.output_token_cost, m.is_default];
    }
  }
  const unstampedSorted = {};
  for (const k of Object.keys(unstamped).sort()) unstampedSorted[k] = unstamped[k];
  const pricing = JSON.stringify({ rates, unstamped: unstampedSorted });

  await d1(
    `UPDATE bots_useraccount SET usage_reset_at = ?, usage_reset_timezone = ?, usage_reset_cost = ?, usage_reset_input_tokens = ?, usage_reset_output_tokens = ?, usage_reset_version = ?, usage_reset_pricing = ? WHERE user_id = ?`,
    [resetAt, timezone, total, inputTokens, outputTokens, 2, pricing, userId]
  );
  return { total, inputTokens, outputTokens };
}

// Reset user 60 to onboarding-fresh state (no PIN, no lockout, no onboarding
// flag, no profiles/bots/chats), then recreate the named profiles + bot via
// the REST API so server defaults/validation apply. Matches the
// seed_e2e_onboarding fresh state (kid profiles + Penelope, PIN-less).
async function resetOnboardingFresh(
  accessToken,
  opts = {},
) {
  const { kidNames = ['Jordan', 'Maya'], botName = 'Penelope', userId = E2E_PARENT_ID } = opts;
  await d1(
    `DELETE FROM bots_message WHERE chat_id IN (SELECT id FROM bots_chat WHERE user_id = ?); ` +
      `DELETE FROM bots_chat WHERE user_id = ?; ` +
      `DELETE FROM bots_flashcard WHERE deck_id IN (SELECT d.id FROM bots_deck d JOIN bots_profile p ON p.id = d.profile_id WHERE p.user_id = ?); ` +
      `DELETE FROM bots_deck WHERE profile_id IN (SELECT id FROM bots_profile WHERE user_id = ?); ` +
      `DELETE FROM bots_profile WHERE user_id = ?; ` +
      `DELETE FROM bots_bot WHERE user_id = ?; ` +
      `UPDATE bots_useraccount SET pin_hash = NULL, pin_failed_attempts = 0, pin_locked_until = NULL, onboarding_completed_at = NULL WHERE user_id = ?`,
    [userId, userId, userId, userId, userId, userId, userId],
  );
  const profiles = [];
  for (const name of kidNames) {
    profiles.push(await ensureProfile(accessToken, name));
  }
  const bot = await ensureBot(accessToken, botName);
  return { profiles, bot };
}

// ---------------------------------------------------------------------------
// Detox / device helpers (need the Detox globals: device, element, by)
// ---------------------------------------------------------------------------

const BUNDLE_ID_EXPORT = BUNDLE_ID;

function tokensManifest(tokens, opts = {}) {
  const { profile = null, bot = null, initialRoute = null } = opts;
  // The app keys stored tokens by EXPO_PUBLIC_API_BASE_URL (front/api/tokens.ts
  // BASE_URL) while this helper keys by API_BASE_URL. A mismatch strands the
  // app unauthenticated with no visible error — fail fast instead. Equal
  // (after trailing-slash normalization) is fine.
  const apiBaseNorm = apiBase();
  // NOTE: read via a dynamically-built key — babel-preset-expo (which jest
  // uses for e2e specs) statically rewrites `process.env.EXPO_PUBLIC_*`
  // member expressions into `require("expo/virtual/env")`, which cannot
  // resolve under jest (node_modules are not transformed). A computed key
  // survives as a plain process.env read.
  const expoBaseRaw = process.env['EXPO_PUBLIC_' + 'API_BASE_URL'];
  if (expoBaseRaw) {
    const expoBaseNorm = String(expoBaseRaw).replace(/\/+$/, '');
    if (expoBaseNorm !== apiBaseNorm) {
      throw new Error(
        `tokensManifest: API_BASE_URL (${apiBaseNorm}) != EXPO_PUBLIC_API_BASE_URL (${expoBaseNorm}). ` +
          `The app looks tokens up by the Expo base — align both (Metro EXPO_PUBLIC_API_BASE_URL + spec API_BASE_URL).`,
      );
    }
  }
  const manifest = {
    tokens: JSON.stringify({ [apiBaseNorm]: tokens }),
    e2eTestMode: 'true',
  };
  if (profile) manifest.selectedProfile = typeof profile === 'string' ? profile : JSON.stringify(profile);
  if (bot) manifest.selectedBot = typeof bot === 'string' ? bot : JSON.stringify(bot);
  if (initialRoute) manifest.e2eInitialRoute = initialRoute;
  return manifest;
}

function injectAsyncStorage(udid, tokens, profile = null, bot = null, opts = {}) {
  const manifest =
    tokens && typeof tokens === 'object' && !tokens.access
      ? tokens // already a manifest object
      : tokensManifest(tokens, { profile, bot, ...opts });
  const containerPath = execSync(`xcrun simctl get_app_container ${udid} ${BUNDLE_ID} data`, {
    encoding: 'utf8',
  }).trim();
  const asDir = path.join(containerPath, 'Library', 'Application Support', BUNDLE_ID, 'RCTAsyncLocalStorage_V1');
  if (!fs.existsSync(asDir)) fs.mkdirSync(asDir, { recursive: true });
  const manifestPath = path.join(asDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  return manifestPath;
}

// Fresh install, boot once so the AsyncStorage dir exists, inject, relaunch.
async function reinstallAndInject(injection) {
  const { tokens, profile = null, bot = null, ...opts } = injection;
  await device.installApp();
  await device.launchApp({ newInstance: true });
  await sleep(2000);
  await device.terminateApp();
  injectAsyncStorage(device.id, tokens, profile, bot, opts);
  await device.launchApp({ newInstance: true });
  await sleep(3000);
}

async function backToDrawer() {
  await element(by.id('header-back-button')).tap();
  await openDrawer();
}

async function openDrawer() {
  await element(by.id('drawer-menu-button')).tap();
  await waitFor(element(by.id('drawer-item-chats'))).toBeVisible().withTimeout(5000);
}

// Server-verified keypad (roadmap 02): pin-key-<d> digits + pin-submit.
async function enterKeypadPin(pin) {
  for (const digit of String(pin).split('')) {
    await element(by.id(`pin-key-${digit}`)).tap();
  }
  await element(by.id('pin-submit')).tap();
}

module.exports = {
  BUNDLE_ID: BUNDLE_ID_EXPORT,
  E2E_PARENT_ID,
  E2E_HELPER_ID,
  E2E_USERNAME,
  E2E_HELPER_USERNAME,
  apiBase,
  isWorkerBase,
  isLocalWorkerBase,
  isWorkersDevBase,
  sleep,
  check,
  uuid,
  authed,
  getTokensFor,
  getParentTokens,
  getHelperTokens,
  getAccount,
  listProfiles,
  listBots,
  reauth,
  ensureNoPin,
  ensurePin,
  completeOnboarding,
  getDefaultModelId,
  ensureProfile,
  ensureProfileByRename,
  ensureBot,
  deleteExtraBots,
  deleteExtraProfiles,
  d1,
  resetPinLockoutState,
  resetOnboardingFresh,
  deleteAllChatsD1,
  ensureSubscriptionLevel,
  resetDailyUsageD1,
  tokensManifest,
  injectAsyncStorage,
  reinstallAndInject,
  backToDrawer,
  openDrawer,
  enterKeypadPin,
};
