/**
 * 05 — First-Run Onboarding and Profile Switcher (docs/roadmap/05)
 *
 * Fresh-state walkthrough of the onboarding wizard
 * (welcome → kid name → first bot → PIN → notifications) ending at a
 * working chat, plus the header profile switcher flow.
 *
 * SEEDING (done in-spec):
 *   PIN cleared, onboarding flag reset to NULL (Worker D1; on local Django
 *   run `seed_e2e_onboarding`), profiles Jordan (+ second Maya), exactly
 *   one Penelope bot — via the public API. No selectedProfile/selectedBot
 *   is injected so first-run state is real.
 *
 * NOTE on the Expo dev-warning banner: it used to cover the bottom-anchored
 * onboarding-get-started CTA (from `Route "./onboarding/WizardStep.tsx"
 * missing default export`). WizardStep now lives outside the route tree
 * (components/onboarding/WizardStep.tsx), so no route warning exists and the
 * banner is gone; the spec still defensively scrolls nothing and taps
 * directly.
 *
 * Run: API_BASE_URL=... npx detox test e2e/05-onboarding.e2e.js -c ios.sim.debug
 */
const {
  check,
  getParentTokens,
  getDefaultModelId,
  isWorkerBase,
  resetPinLockoutState,
  ensureNoPin,
  resetOnboardingFresh,
  deleteAllChatsD1,
  ensureProfile,
  ensureBot,
  deleteExtraBots,
  resetDailyUsageD1,
  authed,
  injectAsyncStorage,
  tokensManifest,
  enterKeypadPin,
  sleep,
} = require('./seedHelpers');

const KID_NAME = 'Alex'; // Renames seeded profile 'Jordan'
const PIN = '1234';

function injectFreshAsyncStorage(udid, tokens) {
  // Deliberately NO selectedProfile / selectedBot: onboarding must start from
  // scratch and end with the wizard choosing them.
  injectAsyncStorage(udid, tokensManifest(tokens));
}

describe('Onboarding E2E Flow (Real API)', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await getParentTokens();
    // Fresh first-run state: the D1 wipes below are Worker-only (on Django
    // run `seed_e2e_onboarding` for the same fresh state); the REST ensures
    // after them work on either backend. The Worker gates the wizard on (no
    // flag AND no chats), so leftover chats from other suites must go too.
    if (isWorkerBase()) {
      await resetPinLockoutState();
      // PR102's resetOnboardingFresh(accessToken) wipes chats/decks/profiles/
      // bots for user 60 and recreates kid profiles Jordan+Maya + Penelope via
      // the REST API — so Jordan already exists below (no rename needed; the
      // old rename-reuse-dirty-profiles step is subsumed by the wipe).
      await resetOnboardingFresh(tokens.access);
      await deleteAllChatsD1();
    } else {
      await ensureNoPin(tokens.access);
    }
    await ensureProfile(tokens.access, 'Jordan');
    await ensureProfile(tokens.access, 'Maya');
    // The onboarding chat must actually answer: wire the default model
    // (PR102's ensureBot takes extra fields via {params}).
    await ensureBot(tokens.access, 'Penelope', {
      params: { ai_model: await getDefaultModelId(tokens.access) },
    });
    // The wizard asserts a single Penelope bot afterwards.
    await deleteExtraBots(tokens.access, ['Penelope']);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await sleep(2000);
    await device.terminateApp();

    injectFreshAsyncStorage(device.id, tokens);

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('onboarding-get-started')))
      .toBeVisible()
      .withTimeout(30000);
    // Quota hermeticity, post-launch (see 06): the onboarding chat answers
    // for real, and any account-timezone flip voids the worker's usage
    // baseline — so reset after boot settles, not before.
    if (isWorkerBase()) await resetDailyUsageD1();
  }, 180000);

  it('walks through all five steps and lands in a working chat', async () => {
    // Step 1: Welcome
    await element(by.id('onboarding-get-started')).tap();
    await waitFor(element(by.id('onboarding-profile-input')))
      .toBeVisible()
      .withTimeout(10000);

    // Step 2: Kid name — blank with a "Student name" placeholder.
    await sleep(1000); // keyboard/layout settle before typing
    await element(by.id('onboarding-profile-input')).typeText(KID_NAME);
    await element(by.id('onboarding-profile-continue')).tap();

    // Step 3: First bot — defaults (Blank / Penelope) are already valid.
    await waitFor(element(by.id('onboarding-bot-continue')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('onboarding-bot-continue')).tap();

    // Step 4: Protect — PIN optional (PIN-less is supported).
    await waitFor(element(by.id('onboarding-pin-input')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('onboarding-pin-input')).typeText(PIN);
    await element(by.id('onboarding-pin-confirm')).typeText(PIN);
    await element(by.id('onboarding-pin-continue')).tap();

    // Step 5: Notifications — toggles optional/off.
    await waitFor(element(by.id('onboarding-notifications-switch')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('onboarding-finish')).tap();

    // Finish → bootstrap → /chat with profile + bot pre-selected.
    await waitFor(element(by.id('chat-input')))
      .toBeVisible()
      .withTimeout(30000);

    // The chat actually works against the real API. Timestamped so runs
    // never collide with leftover probe messages.
    const prompt = `Hello from onboarding e2e ${Date.now()}`;
    await element(by.id('chat-input')).typeText(prompt);
    await element(by.id('send-button')).tap();
    // The user echo renders as plain text (unique); the assistant bubble
    // renders in a WebView (by.text can never match it) inside a container
    // whose testID does not match by.id on this RN build — so verify the
    // assistant turn through the messages API and a screenshot instead.
    await waitFor(element(by.text(prompt))).toBeVisible().withTimeout(30000);
    await device.takeScreenshot('onboarding-working-chat');

    // Server state reflects the wizard: profile renamed, bot kept (not
    // duplicated), PIN set, flag completed. Plain checks (Detox expect
    // only matches elements).
    const profiles = await authed(tokens.access, '/profiles.json');
    const names = (profiles.results || []).map((p) => p.name);
    check(names.includes(KID_NAME), `renamed profile missing: ${JSON.stringify(names)}`);
    const alex = (profiles.results || []).find((p) => p.name === KID_NAME);

    // The assistant turn persisted for Alex's chat (proof the model answered).
    let assistantText = '';
    for (let i = 0; i < 12 && !assistantText; i++) {
      const chats = await authed(tokens.access, `/chats.json?1=1&profileId=${alex.profile_id}`);
      const chatId = chats.results?.[0]?.chat_id;
      if (chatId) {
        const msgs = await authed(tokens.access, `/chats/${chatId}/messages.json`);
        assistantText = (msgs.results || []).find((m) => m.role === 'assistant')?.text || '';
      }
      if (!assistantText) await sleep(5000);
    }
    check(assistantText.length > 0, 'no assistant turn persisted for the onboarding chat');

    const bots = await authed(tokens.access, '/bots.json');
    check(bots.results.length === 1, `expected 1 bot, got ${bots.results.length}`);
    check(bots.results[0].name === 'Penelope', `bot renamed: ${bots.results[0].name}`);

    const account = await authed(tokens.access, '/user?timezone=UTC');
    check(account.onboardingCompleted === true, 'onboarding flag not completed');
    check(account.hasPin === true, 'PIN not set by wizard');
  }, 240000);

  it('never shows the wizard again to returning users', async () => {
    await device.terminateApp();
    await device.launchApp({ newInstance: true });

    // Straight to chat, not /onboarding.
    await waitFor(element(by.id('chat-input')))
      .toBeVisible()
      .withTimeout(20000);
    await expect(element(by.id('onboarding-get-started'))).toBeNotVisible();
  }, 60000);

  it('switches profiles from the header chip without opening Settings', async () => {
    // From /chat (botChat header) back out to the chat list. NOTE: the
    // ProfileSwitcher chip exists TWICE (header + always-mounted drawer),
    // so address the header instance with atIndex(0) — a bare chip matcher
    // is ambiguous and times out.
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id('profile-switcher-chip')).atIndex(0))
      .toBeVisible()
      .withTimeout(10000);

    // Current kid after onboarding is the renamed profile.
    await element(by.id('profile-switcher-chip')).atIndex(0).tap();
    await waitFor(element(by.id(`profile-switcher-option-${KID_NAME}`)))
      .toBeVisible()
      .withTimeout(5000);
    await expect(element(by.id('profile-switcher-option-Maya'))).toBeVisible();

    // Switch to the second kid: her chat list is empty (Alex owns the one
    // onboarding chat), which proves the switch without relying on the
    // chip name text (rendered twice: header + drawer).
    await element(by.id('profile-switcher-option-Maya')).tap();
    await waitFor(element(by.text('No chats yet'))).toBeVisible().withTimeout(10000);

    // Manage profiles… stays available behind the PIN keypad for parents
    // (PinWrapper keypad — never a pin-input field). The bottom sheet
    // animates up: tapping while it settles hits the backdrop and dismisses
    // the modal instead, so settle first, then tap once.
    await element(by.id('profile-switcher-chip')).atIndex(0).tap();
    await waitFor(element(by.id('profile-switcher-manage')))
      .toBeVisible()
      .withTimeout(5000);
    await sleep(2000);
    await element(by.id('profile-switcher-manage')).tap();
    // The keypad mounts inside the bottom sheet (dots visible even while
    // the sheet finishes animating — the title can lag behind it). The
    // sheet keys sit below the fold for Detox taps, so this only proves
    // Manage leads to the PIN gate; full keypad entry is proven right
    // after via the full-screen Settings gate (same PinWrapper).
    try {
      await waitFor(element(by.id('pin-dots'))).toBeVisible().withTimeout(15000);
    } catch (e) {
      await device.takeScreenshot('switcher-manage-no-keypad');
      throw e;
    }

    // Fresh start out of the modal: relaunch (storage persists with Maya
    // selected), then drawer -> Settings -> keypad -> Profiles.
    await device.terminateApp();
    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(20000);
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('drawer-menu-button')).tap();
    await waitFor(element(by.id('drawer-item-settings'))).toBeVisible().withTimeout(5000);
    await element(by.id('drawer-item-settings')).tap();
    await waitFor(element(by.id('pin-title'))).toBeVisible().withTimeout(15000);
    await enterKeypadPin(PIN);
    await waitFor(element(by.id('menu-profiles'))).toBeVisible().withTimeout(10000);
    await element(by.id('menu-profiles')).tap();
    await waitFor(element(by.id('profile-card-Maya')))
      .toBeVisible()
      .withTimeout(20000);
  }, 120000);
});
