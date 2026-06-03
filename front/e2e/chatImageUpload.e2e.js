const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(`Backend not available at ${API_BASE}. Status: ${response.status}`);
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
  return {
    profile: JSON.stringify(profiles.results[0]),
    bot: JSON.stringify(bots.results[0]),
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

describe('Chat Image Upload E2E Flow (Real API)', () => {
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

  it('should upload an image and send a message via real API', async () => {
    await element(by.id('camera-button')).tap();
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('chat-input')).typeText('Real API test image');
    await element(by.id('send-button')).tap();
    await waitFor(element(by.id('chat-message-assistant'))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id('chat-message-image'))).toBeVisible().withTimeout(10000);
  }, 60000);
});
