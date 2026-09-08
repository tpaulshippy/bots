/**
 * Roadmap 06 — Streaming chat and agent UI E2E (docs/roadmap/06-streaming-chat-and-agent-ui.md)
 *
 * Seeding / environment:
 *   1. Start the Django API (API_BASE_URL, default http://localhost:8000/api)
 *      WITHOUT real Bedrock credentials — this flow never calls AWS.
 *   2. Seed once, idempotently:
 *         cd back && python manage.py seed_e2e_streaming_chat
 *      That creates user 'e2e-test-user'/'testpassword123', a profile, and a
 *      bot named "Stream Demo" wired to AiModel 'e2e-fake-stream-mitosis'.
 *      That model id makes AiClientWrapper serve a deterministic FAKE STREAM:
 *      tool_start/tool_end creating deck "Cell Bio" (3 cards), then word-paced
 *      tokens of a fixed answer (~0.12s per token), so intermediate partial
 *      text is observable and assertions are deterministic.
 *
 * Flow under test:
 *   send message -> Stop button visible while streaming -> partial tokens
 *   arrive progressively -> deck-created tool chip -> deck toast -> tap
 *   "Study now" -> deck screen shows the seeded cards.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const DEMO_BOT_NAME = 'Stream Demo';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available at ${API_BASE} (status ${response.status}). ` +
      `Run \`python manage.py seed_e2e_streaming_chat\` and start the server first.`
    );
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

async function getTestProfileAndBot(accessToken) {
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
  // Prefer the seeded fake-stream bot so no AWS credentials are needed.
  const demoBot = bots.results.find((b) => b.name === DEMO_BOT_NAME) || bots.results[0];
  return {
    profile: JSON.stringify(profiles.results[0]),
    bot: JSON.stringify(demoBot),
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
}

describe('Streaming chat and agent UI (fake stream mode)', () => {
  beforeAll(async () => {
    const tokens = await getTestTokens();
    const { profile, bot } = await getTestProfileAndBot(tokens.access);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await device.terminateApp();

    const udid = device.id;
    injectAsyncStorage(udid, tokens, profile, bot);

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(15000);
  }, 120000);

  it('streams tokens progressively, shows tool activity, and toasts the created deck', async () => {
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('chat-input')).typeText('Teach me mitosis and make me a study deck');

    // Replace send with Stop while generation is in flight.
    await element(by.id('send-button')).tap();
    await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(10000);

    // Intermediate partial content arrives progressively from the fake stream.
    // "prophase" is bolded (**prophase**) so markdown renders it as its own
    // text node — safe to match mid-stream.
    await waitFor(element(by.text('prophase'))).toBeVisible().withTimeout(15000);

    // Agent activity: the flashcard-deck tool chip appears...
    await waitFor(element(by.id('agent-chip-deck'))).toBeVisible().withTimeout(10000);

    // ...the stream completes and the composer returns to idle.
    await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(15000);
    await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('chat-message-assistant'))).toBeVisible().withTimeout(10000);

    // Chat -> deck toast hook with a tappable Study CTA.
    await waitFor(element(by.id('deck-toast'))).toBeVisible().withTimeout(10000);
    await element(by.id('deck-toast-study')).tap();

    // Deep link lands on the created deck with its seeded cards.
    await waitFor(element(by.text('What is mitosis?'))).toBeVisible().withTimeout(15000);
  }, 120000);

  it('keeps partial text when the user cancels mid-stream', async () => {
    // Storage was injected in beforeAll; a fresh launch lands back on chat.
    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(15000);
    await element(by.id('chat-input')).typeText('Start explaining mitosis');
    await element(by.id('send-button')).tap();
    await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(10000);

    await element(by.id('stop-button')).tap();
    await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(10000);

    // Back to idle with the assistant bubble (partial tokens kept server-side,
    // doc 06 §2 "prefer save partial").
    await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('chat-message-assistant'))).toBeVisible().withTimeout(10000);
  }, 60000);
});
