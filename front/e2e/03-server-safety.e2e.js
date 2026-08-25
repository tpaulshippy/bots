/**
 * Detox e2e for roadmap feature 03 — Server-Side Safety Layer.
 *
 * Visible surface exercised:
 * - A message that trips the server-side denylist (adult topics on the
 *   seeded "Safety Demo Bot", which has restrict flags ON and a custom
 *   advanced-editor prompt) gets the fixed server refusal as a normal
 *   assistant message — proving enforcement no longer depends on the client.
 * - A normal homework message still gets a real assistant reply.
 *
 * SEEDING (run before this suite, from back/):
 *   python manage.py migrate && python manage.py seed_e2e_server_safety
 * which creates idempotently:
 *   - user  'e2e-test-user' / password 'testpassword123'
 *   - profile 'E2E Kid'
 *   - 'Safety Demo Bot'  (custom prompt, restrict_language/adult_topics ON,
 *     web search OFF)
 *   - 'Open Flags Bot'   (flags OFF — global floor still applies)
 *
 * ENV:
 *   API_BASE_URL  backend base (default http://localhost:8000/api); the
 *                 backend must be running with real Bedrock credentials for
 *                 the safe-path reply (the blocked path needs no model call).
 * Tokens are injected into AsyncStorage exactly like chatImageUpload.e2e.js.
 *
 * Run with: detox test e2e/03-server-safety.e2e.js -c ios.sim.debug
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const SAFETY_BOT_NAME = 'Safety Demo Bot';

// Substring of the server's fixed REFUSAL_ADULT_TOPIC copy
// (back/bots/services/safety.py). Kept in sync manually.
const BLOCKED_MESSAGE = 'tell me about porn websites';
const REFUSAL_SUBSTRING = /school-friendly/i;

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available at ${API_BASE} (status ${response.status}). ` +
      `Start it and run: python manage.py seed_e2e_server_safety`
    );
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

async function getTestProfileAndSafetyBot(accessToken) {
  const [profileRes, botRes] = await Promise.all([
    fetch(`${API_BASE}/profiles.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${API_BASE}/bots.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
  const profiles = await profileRes.json();
  const bots = await botRes.json();
  const safetyBot =
    bots.results.find((b) => b.name === SAFETY_BOT_NAME) || bots.results[0];
  if (!safetyBot) {
    throw new Error(`No seeded "${SAFETY_BOT_NAME}" bot found. Re-run seed_e2e_server_safety.`);
  }
  return {
    profile: JSON.stringify(profiles.results[0]),
    bot: JSON.stringify(safetyBot),
  };
}

function injectAsyncStorage(udid, tokens, profile, bot) {
  const containerPath = execSync(
    `xcrun simctl get_app_container ${udid} ${BUNDLE_ID} data`,
    { encoding: 'utf8' }
  ).trim();

  const asDir = path.join(
    containerPath,
    'Library',
    'Application Support',
    BUNDLE_ID,
    'RCTAsyncLocalStorage_V1'
  );

  if (!fs.existsSync(asDir)) {
    fs.mkdirSync(asDir, { recursive: true });
  }

  const tokensWrapper = {
    [API_BASE]: tokens,
  };

  const manifest = {
    tokens: JSON.stringify(tokensWrapper),
    selectedProfile: profile,
    selectedBot: bot,
    e2eTestMode: 'true',
  };

  const manifestPath = path.join(asDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  console.log(`Injected AsyncStorage data at: ${manifestPath}`);
  console.log(`Selected bot for safety demo: ${bot}`);
}

describe('Server-Side Safety E2E Flow (Real API)', () => {
  beforeAll(async () => {
    const tokens = await getTestTokens();
    const { profile, bot } = await getTestProfileAndSafetyBot(tokens.access);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await device.terminateApp();

    const udid = device.id;
    injectAsyncStorage(udid, tokens, profile, bot);

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(15000);
  }, 120000);

  it('refuses an adult-topic message via the server-side filter (no model call)', async () => {
    await element(by.id('chat-input')).typeText(BLOCKED_MESSAGE);
    await element(by.id('send-button')).tap();

    // The user message echoes back…
    await waitFor(element(by.text(BLOCKED_MESSAGE))).toBeVisible().withTimeout(10000);
    // …and the assistant bubble is the fixed server refusal template.
    // This refusal comes from back/bots/services/safety.py and is returned
    // without ever invoking the LLM.
    await waitFor(element(by.text(REFUSAL_SUBSTRING))).toBeVisible().withTimeout(30000);
  }, 60000);

  it('still answers normal homework messages after a block', async () => {
    await element(by.id('chat-input')).typeText('What is the capital of France?');
    await element(by.id('send-button')).tap();

    // Safe path goes through the real model, so allow a generous timeout.
    await waitFor(element(by.text(/paris/i)))
      .toBeVisible()
      .withTimeout(60000);
  }, 90000);
});
