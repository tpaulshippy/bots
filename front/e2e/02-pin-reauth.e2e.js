/**
 * 02 — PIN Security and Reauth E2E (roadmap doc 02)
 *
 * Drives the parent PIN gate against the REAL backend:
 *   1. Settings shows the reauth keypad (server-verified PIN, no plaintext cache).
 *   2. A wrong PIN shows the server's remaining-attempts count.
 *   3. The correct PIN unlocks Settings and exposes the parent menu.
 *   4. The Set Pin screen enforces confirm + 4–8 digit validation.
 *   5. Five wrong attempts lock the account (423) — run this suite on a
 *      freshly seeded backend, because the lockout persists server-side.
 *
 * Seeding (idempotent; also resets any previous lockout):
 *   cd back && venv/bin/python manage.py migrate && \
 *     venv/bin/python manage.py seed_e2e_pin_reauth
 *   -> creates parent 'e2e-test-user' / 'testpassword123' with PIN '1234'.
 *
 * Environment:
 *   API_BASE_URL (default http://localhost:8000/api) must point at a Django
 *   dev server seeded as above.
 *
 * Run (iOS simulator with a built Detox app):
 *   detox build -c ios.sim.debug && detox test -c ios.sim.debug e2e/02-pin-reauth.e2e.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const E2E_PIN = '1234';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available or not seeded at ${API_BASE}. Status: ${response.status}. ` +
      `Run: cd back && venv/bin/python manage.py seed_e2e_pin_reauth`
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

async function launchToChat() {
  await device.launchApp({ newInstance: true });
  // The in-memory parent session never survives a relaunch, so the keypad
  // is always required again after one.
  await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(15000);
}

async function openSettingsKeypad() {
  await element(by.id('back-button')).tap();
  await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(5000);
  await element(by.id('drawer-menu-button')).tap();
  await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);
  await element(by.id('drawer-item-settings')).tap();
  await waitFor(element(by.id('pin-title'))).toBeVisible().withTimeout(10000);
}

async function enterPin(pin) {
  for (const digit of pin.split('')) {
    await element(by.id(`pin-key-${digit}`)).tap();
  }
  await element(by.id('pin-submit')).tap();
}

describe('PIN Security and Reauth E2E Flow (Real API)', () => {
  beforeAll(async () => {
    const tokens = await getTestTokens();
    const { profile, bot } = await getTestProfileAndBot(tokens.access);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await device.terminateApp();

    const udid = device.id;
    injectAsyncStorage(udid, tokens, profile, bot);

    await launchToChat();
  }, 120000);

  it('shows the parent PIN keypad instead of open settings', async () => {
    await openSettingsKeypad();

    await expect(element(by.id('pin-title'))).toBeVisible();
    await expect(element(by.id('menu-item-profiles'))).not.toExist();
  });

  it('shows remaining attempts after a wrong PIN', async () => {
    await enterPin('9999');

    await waitFor(element(by.text('4 attempts remaining')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('unlocks settings after entering the correct PIN', async () => {
    await enterPin(E2E_PIN);

    await waitFor(element(by.id('menu-item-profiles')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('menu-item-bots'))).toBeVisible();
    await expect(element(by.id('menu-item-set-pin'))).toBeVisible();
  });

  it('requires matching 4-8 digit PINs on the Set Pin screen', async () => {
    await element(by.id('menu-item-set-pin')).tap();
    await waitFor(element(by.id('pin-new-input'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('pin-confirm-input'))).toBeVisible();
    await expect(element(by.id('pin-save-button'))).toBeVisible();

    // Mismatched confirmation must surface a validation error, not save.
    for (const digit of '11111'.split('')) {
      await element(by.id('pin-new-input')).typeText(digit);
    }
    for (const digit of '22222'.split('')) {
      await element(by.id('pin-confirm-input')).typeText(digit);
    }
    await element(by.id('pin-save-button')).tap();

    await waitFor(element(by.id('pin-error')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('locks the account after repeated wrong attempts', async () => {
    // Fresh launch: the in-memory parent session from the unlock above is
    // gone, so the keypad is shown again.
    await launchToChat();
    await openSettingsKeypad();

    // Four more wrong attempts (one was spent earlier in this run) reach
    // the configured limit of five and trip the server-side lockout.
    for (let attempt = 0; attempt < 4; attempt++) {
      await enterPin('9999');
      await waitFor(element(by.id('pin-error'))).toBeVisible().withTimeout(10000);
    }

    await waitFor(element(by.text('PIN locked. Try again later.')))
      .toBeVisible()
      .withTimeout(10000);

    // Even the correct PIN is refused while locked.
    await enterPin(E2E_PIN);
    await expect(element(by.text('PIN locked. Try again later.'))).toBeVisible();
  });
});
