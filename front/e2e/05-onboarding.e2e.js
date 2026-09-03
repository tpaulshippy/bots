/**
 * 05 — First-Run Onboarding and Profile Switcher (docs/roadmap/05)
 *
 * Fresh-state walkthrough of the onboarding wizard
 * (welcome → kid name → first bot → PIN + notifications prompt) ending at a
 * working chat, plus the header profile switcher flow.
 *
 * SEEDING (run before this suite):
 *   cd back && venv/bin/python manage.py seed_e2e_onboarding
 * Creates 'e2e-test-user' / 'testpassword123' with the signup-signal default
 * profile ('Jordan') + Penelope bot, a second profile ('Maya'), and NO pin /
 * onboarding flag — so the app gates to /onboarding. The command is
 * idempotent and resets that fresh state on every run.
 *
 * ENVIRONMENT:
 *   - Backend reachable at API_BASE_URL (default http://localhost:8000/api),
 *     e.g.: cd back && venv/bin/python manage.py runserver
 *   - iOS simulator with the app built via .detoxrc.js ('ios.sim.debug').
 *   - Auth works like e2e/chatImageUpload.e2e.js: tokens are fetched from
 *     ${API_BASE}/token/ and injected into AsyncStorage before launch; no
 *     selectedProfile / selectedBot is injected so first-run state is real.
 *
 * Run: npx detox test e2e/05-onboarding.e2e.js -c ios.sim.debug
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const KID_NAME = 'Alex'; // Renames seeded profile 'Jordan'
const PIN = '1234';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available at ${API_BASE} (or seed_e2e_onboarding not run). Status: ${response.status}`
    );
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

function authedFetch(accessToken, endpoint) {
  return fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((res) => res.json());
}

function injectFreshAsyncStorage(udid, tokens) {
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

  const tokensWrapper = { [API_BASE]: tokens };

  // Deliberately NO selectedProfile / selectedBot: onboarding must start from
  // scratch and end with the wizard choosing them.
  const manifest = {
    tokens: JSON.stringify(tokensWrapper),
    e2eTestMode: 'true',
  };

  const manifestPath = path.join(asDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

  console.log(`Injected fresh AsyncStorage data at: ${manifestPath}`);
}

describe('Onboarding E2E Flow (Real API)', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await getTestTokens();

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await device.terminateApp();

    injectFreshAsyncStorage(device.id, tokens);

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('onboarding-get-started')))
      .toBeVisible()
      .withTimeout(15000);
  }, 120000);

  it('walks through all four steps and lands in a working chat', async () => {
    // Step 1: Welcome
    await element(by.id('onboarding-get-started')).tap();
    await waitFor(element(by.id('onboarding-profile-input')))
      .toBeVisible()
      .withTimeout(5000);

    // Step 2: Kid name — pre-filled with the signal-created "Jordan".
    await element(by.id('onboarding-profile-input')).replaceText(KID_NAME);
    await element(by.id('onboarding-profile-continue')).tap();

    // Step 3: First bot — defaults (Blank / Penelope) are already valid.
    await waitFor(element(by.id('onboarding-bot-continue')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('onboarding-bot-continue')).tap();

    // Step 4: Protect — PIN required, notifications toggle optional/off.
    await waitFor(element(by.id('onboarding-pin-input')))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.id('onboarding-notifications-switch'))).toBeVisible();
    await element(by.id('onboarding-pin-input')).typeText(PIN);
    await element(by.id('onboarding-pin-confirm')).typeText(PIN);
    await element(by.id('onboarding-finish')).tap();

    // Finish → bootstrap → /chat with profile + bot pre-selected.
    await waitFor(element(by.id('chat-input')))
      .toBeVisible()
      .withTimeout(20000);

    // The chat actually works against the real API.
    await element(by.id('chat-input')).typeText('Hello from onboarding e2e');
    await element(by.id('send-button')).tap();
    await waitFor(element(by.id('chat-message-assistant')))
      .toBeVisible()
      .withTimeout(30000);

    // Server state reflects the wizard: profile renamed, bot kept (not
    // duplicated), PIN set, flag completed.
    const profiles = await authedFetch(tokens.access, '/profiles.json');
    const names = profiles.results.map((p) => p.name);
    expect(names).toContain(KID_NAME);

    const bots = await authedFetch(tokens.access, '/bots.json');
    expect(bots.results.length).toBe(1);
    expect(bots.results[0].name).toBe('Penelope');

    const account = await authedFetch(tokens.access, '/user?timezone=UTC');
    expect(account.onboardingCompleted).toBe(true);
    expect(String(account.pin)).toBe(PIN);
  }, 180000);

  it('never shows the wizard again to returning users', async () => {
    await device.terminateApp();
    await device.launchApp({ newInstance: true });

    // Straight to chat, not /onboarding.
    await waitFor(element(by.id('chat-input')))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.id('onboarding-get-started'))).toBeNotVisible();
  }, 60000);

  it('switches profiles from the header chip without opening Settings', async () => {
    // The chip lives on the Chats list header and in the drawer.
    await element(by.id('menu-button')).tap();
    await element(by.id('drawer-item-chats')).tap();
    await waitFor(element(by.id('profile-switcher-chip')))
      .toBeVisible()
      .withTimeout(10000);

    // Current kid after onboarding is the renamed profile.
    await element(by.id('profile-switcher-chip')).tap();
    await waitFor(element(by.id(`profile-switcher-option-${KID_NAME}`)))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.id('profile-switcher-option-Maya'))).toBeVisible();

    // Switch to the second kid.
    await element(by.id('profile-switcher-option-Maya')).tap();

    // Chip now shows Maya; the sheet is closed so this text is unique.
    await expect(element(by.text('Maya'))).toBeVisible();

    // Manage profiles… stays available behind the PIN gate for parents.
    await element(by.id('profile-switcher-chip')).tap();
    await waitFor(element(by.id('profile-switcher-manage')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('profile-switcher-manage')).tap();
    await waitFor(element(by.id('pin-input')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('pin-input')).typeText(PIN);
    await waitFor(element(by.text('Profiles')))
      .toBeVisible()
      .withTimeout(10000);
  }, 90000);
});
