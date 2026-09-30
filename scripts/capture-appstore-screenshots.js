#!/usr/bin/env node
/**
 * Capture App Store screenshots in the iOS Simulator against a local backend.
 *
 * No Detox, no UI automation: every shot is a fresh launch with an injected
 * AsyncStorage manifest (tokens + profile/bot + e2eTestMode + e2eInitialRoute).
 * The app's index route honors `e2eInitialRoute` in e2e mode, so each screen
 * is reached deterministically.
 *
 * Prerequisites:
 *   1. Backend running with seeded demo data (from back/):
 *        python manage.py migrate
 *        python manage.py loaddata bots/fixtures/ai_models.json
 *        python manage.py seed_e2e_parent_review
 *        python manage.py seed_e2e_streaming_chat
 *        python manage.py seed_e2e_spaced_repetition
 *        (optional, for the Activity shot without a PIN prompt:
 *         clear the account PIN in the Django shell)
 *      then:  python manage.py runserver 127.0.0.1:8000
 *   2. Simulator build of the app with EXPO_PUBLIC_API_BASE_URL pointing at
 *      that backend, e.g.:
 *        EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api \
 *          npx expo run:ios --configuration Release --device "<udid>"
 *      (Release so no __DEV__ Developer Options / warning toast appear.
 *      The build needs NSAllowsLocalNetworking for cleartext http to
 *      127.0.0.1 — see docs/app-store/1.0.6/screenshots/README.md.)
 *
 * Usage:
 *   node scripts/capture-appstore-screenshots.js \
 *     --udid <sim-udid> --app <path/to/SyftLearning.app> --out <dir>
 *     [--api http://127.0.0.1:8000/api]
 */
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const UDID = arg('udid', process.env.SIM_UDID);
const APP = arg('app', process.env.SIM_APP);
const OUT = arg('out', 'docs/app-store/1.0.6/screenshots');
const API_BASE = arg('api', 'http://127.0.0.1:8000/api');
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';

if (!UDID || !APP) {
  console.error('Missing --udid and/or --app. See header usage.');
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

async function apiGet(apiPath, access) {
  const res = await fetch(`${API_BASE}${apiPath}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) throw new Error(`GET ${apiPath} -> ${res.status}`);
  return res.json();
}

const rows = (p) => (Array.isArray(p) ? p : p.results || []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeManifest(manifest) {
  const container = sh(`xcrun simctl get_app_container ${UDID} ${BUNDLE_ID} data`);
  const asDir = path.join(
    container, 'Library', 'Application Support', BUNDLE_ID, 'RCTAsyncLocalStorage_V1'
  );
  fs.mkdirSync(asDir, { recursive: true });
  fs.writeFileSync(path.join(asDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

function shot(name) {
  const dest = path.join(OUT, `${name}.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', dest]);
  console.log('saved', dest);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Fresh install = clean AsyncStorage for the login shot.
  sh(`xcrun simctl uninstall ${UDID} ${BUNDLE_ID} || true`);
  sh(`xcrun simctl install ${UDID} "${APP}"`);

  const tokenRes = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!tokenRes.ok) throw new Error(`token endpoint -> ${tokenRes.status}`);
  const { access, refresh } = await tokenRes.json();
  const tokens = { access, refresh };

  const [profiles, bots, chats, decks] = await Promise.all([
    apiGet('/profiles.json', access),
    apiGet('/bots.json', access),
    apiGet('/chats.json', access),
    apiGet('/decks.json', access),
  ]);
  const bot = JSON.stringify(rows(bots)[0]);

  // Pick the chat with the most messages for the richest transcript shot,
  // then adopt ITS profile — seeded demo data lives under one kid profile
  // and the list screens filter by the selected profile.
  let chatId = null;
  let chatProfile = null;
  let best = -1;
  for (const c of rows(chats)) {
    const id = c.chat_id ?? c.id;
    try {
      const msgs = await apiGet(`/chats/${id}/messages.json`, access);
      const n = rows(msgs).length;
      if (n > best) { best = n; chatId = id; chatProfile = c.profile ?? null; }
    } catch (e) { /* skip */ }
  }
  if (!chatId) throw new Error('No seeded chat found');
  const profile = JSON.stringify(
    chatProfile ?? rows(profiles).find((p) => p.name === 'Maya') ?? rows(profiles)[0]
  );
  const deck = rows(decks)[0];
  const deckId = deck?.deck_id ?? deck?.id;
  if (!deckId) throw new Error('No seeded deck found');
  console.log(`chat=${chatId} (${best} msgs) deck=${deckId}`);

  try {
    sh(`xcrun simctl status_bar ${UDID} override --time "9:41" --cellularBars 4 --wifiBars 3 --batteryState charged --batteryLevel 100`);
  } catch (e) { console.log('status_bar override failed (non-fatal)'); }

  async function launchAt(name, { route, waitMs = 12000, includeBot = true } = {}) {
    try { sh(`xcrun simctl terminate ${UDID} ${BUNDLE_ID}`); } catch (e) { /* not running */ }
    writeManifest({
      tokens: JSON.stringify({ [API_BASE]: tokens }),
      selectedProfile: profile,
      e2eTestMode: 'true',
      ...(includeBot ? { selectedBot: bot } : {}),
      ...(route ? { e2eInitialRoute: route } : {}),
    });
    sh(`xcrun simctl launch ${UDID} ${BUNDLE_ID}`);
    await sleep(waitMs);
    shot(name);
  }

  // 01: logged-out login screen.
  sh(`xcrun simctl uninstall ${UDID} ${BUNDLE_ID} || true`);
  sh(`xcrun simctl install ${UDID} "${APP}"`);
  sh(`xcrun simctl launch ${UDID} ${BUNDLE_ID}`);
  await sleep(12000);
  shot('01-login');

  await launchAt('02-onboarding', { route: '/onboarding' });
  await launchAt('03-select-bot', { route: '/chat', includeBot: false });
  await launchAt('04-chat-list', { route: '/chatHistory' });
  await launchAt('05-chat', { route: `/botChat?chatId=${chatId}`, waitMs: 14000 });
  await launchAt('06-flashcards', { route: '/flashcards' });
  await launchAt('07-deck', { route: `/flashcards/deck?deckId=${deckId}` });
  await launchAt('08-study', { route: `/flashcards/study?deckId=${deckId}` });
  await launchAt('09-stats', { route: '/stats' });
  await launchAt('10-study-materials', { route: '/studyMaterials' });
  await launchAt('11-activity', { route: '/parent/activity' });

  console.log('done.');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
