/**
 * Teen Delegated Login E2E (docs/roadmap/01-teen-delegated-login.md)
 *
 * REQUIRED SEEDING
 *   cd back && venv/bin/python manage.py seed_e2e_teen_login
 *   Creates parent user 'e2e-test-user' / 'testpassword123' with teen
 *   profile 'Maya' bound to maya@school.edu and sibling profile 'Leo'.
 *
 * REQUIRED ENV
 *   API_BASE_URL   Base URL of a RUNNING Django dev server, e.g.
 *                  http://localhost:8000/api (default below).
 *                  Start with: cd back && venv/bin/python manage.py runserver
 *
 * RUN
 *   cd front && npx detox test -c ios.sim.debug e2e/01-teen-login.e2e.js
 *
 * Auth pattern (same as chatImageUpload.e2e.js): parent tokens come from
 * POST ${API_BASE}/token/, then tokens/profile are injected into the app's
 * AsyncStorage via `xcrun simctl get_app_container ... data`.
 * Teen-delegated JWTs cannot be obtained via /token/ (they only exist after
 * an OAuth login), so they are minted by shelling out to the backend venv
 * and calling SyftRefreshToken.for_delegated_profile directly - the exact
 * code path production uses.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const BACK_DIR = path.join(__dirname, '..', '..', 'back');
const TEEN_EMAIL = 'maya@school.edu';

async function getParentTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available at ${API_BASE} (or seed missing). Status: ${response.status}`
    );
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

async function fetchProfiles(accessToken) {
  const response = await fetch(`${API_BASE}/profiles.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await response.json()).results;
}

async function fetchProfileById(accessToken, profileId) {
  const profiles = await fetchProfiles(accessToken);
  return profiles.find((p) => p.profile_id === profileId);
}

/**
 * Mint real teen-delegated tokens via the backend's own token machinery so
 * the claims (is_teen_delegated + active_profile_id) are signed correctly.
 */
function mintDelegatedTokens(profileId) {
  const script =
    "from bots.models import Profile; " +
    "from bots.tokens import SyftRefreshToken; " +
    `p = Profile.objects.get(profile_id='${profileId}'); ` +
    "r = SyftRefreshToken.for_delegated_profile(p.user, p); " +
    "print(str(r.access_token)); print(str(r))";
  const out = execSync(`venv/bin/python manage.py shell -c "${script}"`, {
    cwd: BACK_DIR,
    encoding: 'utf8',
  });
  const [access, refresh] = out.trim().split('\n');
  if (!access || !refresh) {
    throw new Error('Failed to mint delegated tokens from backend venv');
  }
  return { access, refresh };
}

function injectAsyncStorage(udid, { tokens, profile, initialRoute }) {
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

  const manifest = {
    tokens: JSON.stringify({ [API_BASE]: tokens }),
    selectedProfile: profile ? JSON.stringify(profile) : '',
    e2eTestMode: 'true',
    ...(initialRoute ? { e2eInitialRoute: initialRoute } : {}),
  };

  fs.writeFileSync(path.join(asDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

async function launchAndInject(injection) {
  await device.installApp();
  await device.launchApp({ newInstance: true });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await device.terminateApp();

  injectAsyncStorage(device.id, injection);

  await device.launchApp({ newInstance: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function openDrawer() {
  await element(by.id('drawer-menu-button')).tap();
  await waitFor(element(by.id('drawer-item-chats'))).toBeVisible().withTimeout(5000);
}

describe('Teen delegated login (roadmap 01)', () => {
  let parentTokens;
  let maya;

  beforeAll(async () => {
    parentTokens = await getParentTokens();
    maya = (await fetchProfiles(parentTokens.access)).find(
      (p) => p.name === 'Maya'
    );
    if (!maya) throw new Error("Seed missing: no profile named 'Maya'");
  }, 120000);

  it('parent drawer still shows Settings (parent session unchanged)', async () => {
    const mayaFull = await fetchProfileById(parentTokens.access, maya.profile_id);
    await launchAndInject({
      tokens: parentTokens,
      profile: mayaFull,
      initialRoute: '/chatHistory',
    });

    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(15000);
    await openDrawer();

    await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(3000);
  });

  it('parent binds a teen sign-in email from the profile editor', async () => {
    // Navigate: drawer -> Settings -> Profiles -> long-press Maya's card.
    await openDrawer();
    await element(by.id('drawer-item-settings')).tap();
    await waitFor(element(by.id('menu-profiles'))).toBeVisible().withTimeout(5000);
    await element(by.id('menu-profiles')).tap();
    await waitFor(element(by.id('profile-card-Maya'))).toBeVisible().withTimeout(10000);

    await element(by.id('profile-card-Maya')).longPress();
    await waitFor(element(by.id('teen-signin-email-input'))).toBeVisible().withTimeout(5000);

    // Bind the email and save (header checkmark).
    await element(by.id('teen-signin-email-input')).replaceText(TEEN_EMAIL);
    await element(by.id('save-profile-button')).tap();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify persistence through the API.
    const stored = await fetchProfileById(parentTokens.access, maya.profile_id);
    expect((stored.oauth_email || '').toLowerCase()).toBe(TEEN_EMAIL);

    // Re-open the editor: binding is shown, then removed.
    await waitFor(element(by.id('profile-card-Maya'))).toBeVisible().withTimeout(10000);
    await element(by.id('profile-card-Maya')).longPress();
    await waitFor(element(by.id('teen-signin-email-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('remove-teen-signin-button')).tap();
    await element(by.id('save-profile-button')).tap();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const cleared = await fetchProfileById(parentTokens.access, maya.profile_id);
    expect(cleared.oauth_email === null || cleared.oauth_email === '').toBe(true);
  });

  it('teen-delegated session hides Settings in the drawer', async () => {
    const teenTokens = mintDelegatedTokens(maya.profile_id);
    await launchAndInject({
      tokens: teenTokens,
      profile: { profile_id: maya.profile_id, name: 'Maya' },
      initialRoute: '/chatHistory',
    });

    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(15000);
    await openDrawer();

    await waitFor(element(by.id('drawer-item-chats'))).toBeVisible().withTimeout(3000);
    await waitFor(element(by.id('drawer-item-flashcards'))).toBeVisible().withTimeout(3000);
    expect(element(by.id('drawer-item-settings')).exists()).toBe(false);
  });

  it('teen deep link into /parent/* bounces off the parent area', async () => {
    await device.openURL({ url: 'botsforkids://parent/settings' });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // The app is alive on a kid-safe screen and the drawer stays teen-scoped.
    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
    await openDrawer();
    expect(element(by.id('drawer-item-settings')).exists()).toBe(false);
  });
});
