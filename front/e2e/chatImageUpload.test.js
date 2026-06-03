const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://192.168.0.152:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
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

/**
 * Write AsyncStorage manifest.json directly into the iOS simulator's app container.
 * This bypasses login by pre-populating tokens, profile, bot, and E2E mode.
 */
function injectAsyncStorage(udid, tokens, profile, bot) {
  // Get the app data container path
  const containerPath = execSync(
    `xcrun simctl get_app_container ${udid} ${BUNDLE_ID} data`,
    { encoding: 'utf8' }
  ).trim();

  // AsyncStorage v2 stores data in:
  // <Application Support>/<bundleID>/RCTAsyncLocalStorage_V1/manifest.json
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

  // The token wrapper is keyed by BASE_URL
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
  console.log(`  tokens length: ${manifest.tokens.length}`);
}

describe('Chat Image Upload E2E Flow (Real API)', () => {
  beforeAll(async () => {
    // 1. Fetch real tokens and test data from the backend API
    const tokens = await getTestTokens();
    const { profile, bot } = await getTestProfileAndBot(tokens.access);

    // 2. Install and launch the app once so iOS creates the app data container
    await device.installApp();
    await device.launchApp({ newInstance: true });

    // Give the app a moment to initialize its filesystem
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Terminate the app so we can safely modify its sandbox
    await device.terminateApp();

    // 4. Inject AsyncStorage data directly into the simulator filesystem
    const udid = device.id;
    injectAsyncStorage(udid, tokens, profile, bot);

    // 5. Relaunch the app — it should now find tokens and redirect straight to chat
    await device.launchApp({ newInstance: true });

    // 6. Wait for the chat screen to appear
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(15000);
  }, 120000);

  it('should upload an image and send a message via real API', async () => {
    // Tap the camera button to attach an image (E2E mode mocks the picker)
    await element(by.id('camera-button')).tap();

    // Type a test message
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('chat-input')).typeText('Real API test image');

    // Send the message — this hits the REAL backend API
    await element(by.id('send-button')).tap();

    // Wait for the assistant response from the real API
    // The real backend uses AWS Bedrock/Nova — this may take 5–15 seconds
    await waitFor(element(by.id('chat-message-assistant'))).toBeVisible().withTimeout(30000);

    // Verify the sent image appears in the chat history
    await waitFor(element(by.id('chat-message-image'))).toBeVisible().withTimeout(10000);
  }, 60000);
});
