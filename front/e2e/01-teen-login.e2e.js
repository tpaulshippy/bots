/**
 * Teen Delegated Login E2E (docs/roadmap/01-teen-delegated-login.md)
 *
 * SEEDING (done in-spec, no manage.py needed on either backend):
 *   Parent 'e2e-test-user' with teen profile 'Maya' (unbound) + sibling
 *   'Leo', plus a bot for chat injection. The email binding itself is the
 *   UI under test (bound then removed), so the setup leaves Maya unbound.
 *
 * Teen-delegated JWTs come from the WORKER-PARITY path, which stock Django
 * supports with the same shape (back/bots/views/get_jwt.py):
 *   helper login (e2e-teen-helper / testpassword123, whose user email IS
 *   maya@school.edu) -> GET /api/login?json= mints {access, refresh,
 *   is_teen_delegated: true, active_profile_id} once Maya is bound.
 * No Django-shell minting: the same spec passes on both backends.
 *
 * Auth pattern: parent tokens from POST ${API_BASE}/token/, injected into
 * AsyncStorage via `xcrun simctl get_app_container ... data`, with a fresh
 * selectedProfile/selectedBot (no e2eInitialRoute: it is dead — the app
 * reads it only under isE2ETestMode(), which checks NSUserDefaults
 * launchArgs that Detox never sets).
 *
 * Run: API_BASE_URL=... npx detox test -c ios.sim.debug e2e/01-teen-login.e2e.js
 */
const {
  check,
  getParentTokens,
  getHelperTokens,
  resetPinLockoutState,
  ensureNoPin,
  completeOnboarding,
  ensureProfile,
  ensureBot,
  authed,
  injectAsyncStorage,
  tokensManifest,
  enterKeypadPin,
  sleep,
} = require('./seedHelpers');

const TEEN_EMAIL = 'maya@school.edu';

/** Teen-delegated tokens via the parity path (helper -> GET /login?json=). */
async function getDelegatedTokens() {
  const helper = await getHelperTokens();
  const res = await fetch(`${process.env.API_BASE_URL || 'http://localhost:8000/api'}/login?json=`, {
    headers: { Authorization: `Bearer ${helper.access}` },
  });
  if (!res.ok) throw new Error(`GET /login delegation failed: ${res.status}`);
  const data = await res.json();
  check(data.is_teen_delegated === true, 'expected is_teen_delegated delegation');
  check(typeof data.active_profile_id === 'string' && data.active_profile_id, 'expected active_profile_id claim');
  return { access: data.access, refresh: data.refresh, activeProfileId: data.active_profile_id };
}

async function fetchProfileById(access, profileId) {
  // PR102 seedHelpers: authed(accessToken, endpoint, options) returns parsed JSON.
  const data = await authed(access, '/profiles.json');
  return (data.results || []).find((p) => p.profile_id === profileId);
}

async function launchAndInject(manifest) {
  await device.installApp();
  await device.launchApp({ newInstance: true });
  await sleep(2000);
  await device.terminateApp();

  injectAsyncStorage(device.id, manifest);

  await device.launchApp({ newInstance: true });
  await sleep(3000);
}

/** From a /chat screen to an open drawer (back-button pattern). */
async function openDrawerFromChat() {
  // First launch after install is slow (fonts/bootstrap/account fetch).
  await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(45000);
  await element(by.id('header-back-button')).tap();
  await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
  await element(by.id('drawer-menu-button')).tap();
  await waitFor(element(by.id('drawer-item-chats'))).toBeVisible().withTimeout(5000);
}

describe('Teen delegated login (roadmap 01)', () => {
  let parentTokens;
  let maya;
  let bot;

  beforeAll(async () => {
    parentTokens = await getParentTokens();
    await resetPinLockoutState();
    // Profile writes need a PIN-free account; the teen binding flow has no
    // PIN gate, so leave it cleared.
    await ensureNoPin(parentTokens.access);
    await completeOnboarding(parentTokens.access);
    // Maya starts UNBOUND: binding her email is the UI under test.
    maya = await ensureProfile(parentTokens.access, 'Maya');
    if ((maya.oauth_email || '').toLowerCase() === TEEN_EMAIL) {
      const cleared = await authed(parentTokens.access, `/profiles/${maya.profile_id}/`, {
        method: 'PUT',
        body: { name: 'Maya', oauth_email: '' },
      });
      check(cleared && cleared.profile_id, 'could not unbind Maya for a clean start');
      maya = cleared;
    }
    await ensureProfile(parentTokens.access, 'Leo');
    bot = await ensureBot(parentTokens.access, 'Penelope');
  }, 180000);

  it('parent drawer still shows Settings (parent session unchanged)', async () => {
    await launchAndInject(
      // PR102 tokensManifest takes {profile, bot} (mapped to selectedProfile/selectedBot).
      tokensManifest(parentTokens, {
        profile: JSON.stringify(maya),
        bot: JSON.stringify(bot),
      })
    );

    await openDrawerFromChat();
    await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);
  });

  it('parent binds a student sign-in email from the profile editor', async () => {
    // Fresh launch: the previous test leaves the drawer open on the chat
    // list, so re-inject parent state and start from /chat.
    await launchAndInject(
      tokensManifest(parentTokens, {
        profile: JSON.stringify(maya),
        bot: JSON.stringify(bot),
      })
    );
    // Navigate: drawer -> Settings -> Profiles -> tap Maya's card.
    await openDrawerFromChat();
    await element(by.id('drawer-item-settings')).tap();
    await waitFor(element(by.id('menu-profiles'))).toBeVisible().withTimeout(10000);
    await element(by.id('menu-profiles')).tap();
    await waitFor(element(by.id('profile-card-Maya'))).toBeVisible().withTimeout(10000);

    // Tap (not long-press: cards only handle onPress) opens the editor.
    await element(by.id('profile-card-Maya')).tap();
    await waitFor(element(by.id('teen-signin-email-input'))).toBeVisible().withTimeout(10000);
    await sleep(1500); // keyboard/layout settle before typing

    // Bind the email and save (header checkmark). NOTE: the checkmark
    // lives in the native header and its onPress commits asynchronously
    // after each keystroke — tapping instantly after typing can fire a
    // stale save without the email. Wait for the Remove button (proves the
    // typed state committed) plus a settle beat before saving.
    await element(by.id('teen-signin-email-input')).replaceText(TEEN_EMAIL);
    // replaceText can miss on the simulator keyboard: retry until the
    // Remove button proves the typed state committed (max 3 attempts).
    let typed = false;
    for (let i = 0; i < 3 && !typed; i++) {
      try {
        await waitFor(element(by.id('remove-teen-signin-button'))).toBeVisible().withTimeout(8000);
        typed = true;
      } catch {
        await element(by.id('teen-signin-email-input')).replaceText(TEEN_EMAIL);
      }
    }
    check(typed, 'email input never committed the typed text');
    await sleep(2500);
    await element(by.id('save-profile-button')).tap();

    // Verify persistence through the API (plain check, not Detox expect),
    // polling for the PUT to land.
    let stored = null;
    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      stored = await fetchProfileById(parentTokens.access, maya.profile_id);
      if ((stored.oauth_email || '').toLowerCase() === TEEN_EMAIL) break;
    }
    check((stored.oauth_email || '').toLowerCase() === TEEN_EMAIL, `email not persisted: ${stored.oauth_email}`);

    // Re-open the editor: binding is shown, then removed. Settle first:
    // the auto-focused keyboard shifts the layout, so tapping instantly
    // can miss the button.
    await waitFor(element(by.id('profile-card-Maya'))).toBeVisible().withTimeout(10000);
    await element(by.id('profile-card-Maya')).tap();
    await waitFor(element(by.id('teen-signin-email-input'))).toBeVisible().withTimeout(10000);
    await sleep(2000);
    let removed = false;
    for (let i = 0; i < 3 && !removed; i++) {
      await element(by.id('remove-teen-signin-button')).tap();
      await sleep(1500);
      try {
        await expect(element(by.id('remove-teen-signin-button'))).toBeNotVisible();
        removed = true;
      } catch {
        // Button still there: tap again (missed during layout shift).
      }
    }
    check(removed, 'Remove student sign-in never applied');
    // Same header-staleness race as above: settle before saving.
    await sleep(2500);
    await element(by.id('save-profile-button')).tap();

    let cleared = null;
    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      cleared = await fetchProfileById(parentTokens.access, maya.profile_id);
      if (!cleared.oauth_email) break;
    }
    check(cleared.oauth_email === null || cleared.oauth_email === '', `email not cleared: ${cleared.oauth_email}`);
  });

  it('teen-delegated session shows the teen-safe Settings (study reminders only)', async () => {
    // Re-bind Maya so the helper login delegates to her (parity path).
    const rebound = await authed(parentTokens.access, `/profiles/${maya.profile_id}/`, {
      method: 'PUT',
      body: { name: 'Maya', oauth_email: TEEN_EMAIL },
    });
    check(
      rebound && (rebound.oauth_email || '').toLowerCase() === TEEN_EMAIL,
      `rebind failed: ${JSON.stringify(rebound)}`
    );

    const teenTokens = await getDelegatedTokens();
    check(teenTokens.activeProfileId === maya.profile_id, 'delegation locked to the wrong profile');

    await launchAndInject(
      tokensManifest(teenTokens, {
        profile: JSON.stringify({ profile_id: maya.profile_id, name: 'Maya' }),
        bot: JSON.stringify(bot),
      })
    );

    await openDrawerFromChat();

    await waitFor(element(by.id('drawer-item-chats'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('drawer-item-flashcards'))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);

    // Teen Settings exposes the study-reminder opt-in, never parent surfaces.
    await element(by.id('drawer-item-settings')).tap();
    await waitFor(element(by.id('teen-study-due-switch'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('menu-profiles'))).toNotExist();

    // Leave Maya unbound so re-runs start clean.
    await authed(parentTokens.access, `/profiles/${maya.profile_id}/`, {
      method: 'PUT',
      body: { name: 'Maya', oauth_email: '' },
    });
  });

  it('teen deep link into /parent/* bounces off the parent area', async () => {
    await device.openURL({ url: 'botsforkids://parent/settings' });
    await sleep(2500);

    // The guard bounces to /chat: the composer proves a kid-safe screen.
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('drawer-menu-button')).tap();
    await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);
    await element(by.id('drawer-item-settings')).tap();
    await waitFor(element(by.id('teen-study-due-switch'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('menu-profiles'))).toNotExist();
  });
});
