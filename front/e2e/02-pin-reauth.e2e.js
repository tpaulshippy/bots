/**
 * 02 — PIN Security and Reauth E2E (roadmap doc 02)
 *
 * Drives the parent PIN gate against the REAL backend:
 *   1. Settings shows the reauth keypad (server-verified PIN, no plaintext cache).
 *   2. A wrong PIN shows the server's remaining-attempts count.
 *   3. The correct PIN unlocks Settings and exposes the parent menu.
 *   4. The Set Pin screen enforces confirm + 4–8 digit validation.
 *   5. Five wrong attempts lock the account (423) — the setup resets any
 *      previous lockout first (D1 on Worker; seed_e2e_pin_reauth on Django),
 *      and leaves the account locked at the end (later suites reset it).
 *
 * Seeding is done in-spec via the public API (no manage.py needed):
 *   PIN 1234 set + lockout cleared, onboarding completed, ≥1 profile+bot.
 *
 * Environment:
 *   API_BASE_URL (default http://localhost:8000/api)
 *
 * Run (iOS simulator with a built Detox app):
 *   API_BASE_URL=... npx detox test -c ios.sim.debug e2e/02-pin-reauth.e2e.js
 */
const {
  check,
  getParentTokens,
  listProfiles,
  listBots,
  resetPinLockoutState,
  ensurePin,
  completeOnboarding,
  injectAsyncStorage,
  tokensManifest,
  backToDrawer,
  openDrawer,
  enterKeypadPin,
  sleep,
  authed,
} = require('./seedHelpers');

const E2E_PIN = '1234';

async function seedProfileAndBot(access) {
  let profiles = await listProfiles(access);
  let alive = profiles.filter((p) => !p.deleted_at);
  if (alive.length === 0) {
    const created = await authed(access, '/profiles.json', { method: 'POST', body: { name: 'PIN Kid' } });
    check(created && created.profile_id, 'seed profile create failed');
    alive = [created];
  }
  let bots = await listBots(access);
  let botsAlive = bots.filter((b) => !b.deleted_at);
  if (botsAlive.length === 0) {
    const created = await authed(access, '/bots.json', { method: 'POST', body: { name: 'PIN Bot' } });
    check(created && created.bot_id, 'seed bot create failed');
    botsAlive = [created];
  }
  return { profile: JSON.stringify(alive[0]), bot: JSON.stringify(botsAlive[0]) };
}

async function launchToChat() {
  await device.launchApp({ newInstance: true });
  // The in-memory parent session never survives a relaunch, so the keypad
  // is always required again after one.
  await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(15000);
}

async function openSettingsKeypad() {
  await element(by.id('header-back-button')).tap();
  await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(5000);
  await element(by.id('drawer-menu-button')).tap();
  await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);
  await element(by.id('drawer-item-settings')).tap();
  await waitFor(element(by.id('pin-title'))).toBeVisible().withTimeout(10000);
}

describe('PIN Security and Reauth E2E Flow (Real API)', () => {
  beforeAll(async () => {
    const tokens = await getParentTokens();
    // Lockout from a previous run would 423 the very first reauth, and a
    // fresh-onboarding flag (left by 05) would land on the wizard: reset both.
    // (PR102's ensurePin does not clear lockouts itself, so reset D1 first.)
    await resetPinLockoutState();
    await ensurePin(tokens.access, E2E_PIN);
    await completeOnboarding(tokens.access);
    const { profile, bot } = await seedProfileAndBot(tokens.access);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await sleep(2000);
    await device.terminateApp();

    injectAsyncStorage(device.id, tokensManifest(tokens, { profile, bot }));

    await launchToChat();
  }, 120000);

  it('shows the parent PIN keypad instead of open settings', async () => {
    await openSettingsKeypad();

    await expect(element(by.id('pin-title'))).toBeVisible();
    await expect(element(by.id('menu-profiles'))).not.toExist();
  });

  it('shows remaining attempts after a wrong PIN', async () => {
    await enterKeypadPin('9999');

    await waitFor(element(by.text('4 attempts remaining')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('unlocks settings after entering the correct PIN', async () => {
    await enterKeypadPin(E2E_PIN);

    await waitFor(element(by.id('menu-profiles')))
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
    // NOTE: the inputs strip non-digits; type each PIN in one call.
    await element(by.id('pin-new-input')).typeText('11111');
    await element(by.id('pin-confirm-input')).typeText('22222');
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

    // Five wrong attempts (a correct unlock in the previous test resets
    // the server-side counter, so all five must be spent here) reach the
    // configured limit and trip the server-side lockout.
    for (let attempt = 0; attempt < 5; attempt++) {
      await enterKeypadPin('9999');
      await waitFor(element(by.id('pin-error'))).toBeVisible().withTimeout(10000);
    }

    await waitFor(element(by.text('PIN locked. Try again later.')))
      .toBeVisible()
      .withTimeout(10000);

    // Even the correct PIN is refused while locked.
    await enterKeypadPin(E2E_PIN);
    await expect(element(by.text('PIN locked. Try again later.'))).toBeVisible();
  });
});
