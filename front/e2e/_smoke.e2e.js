/**
 * Smoke: tokens + profile/bot selection injection lands on chat.
 *
 * Tokens alone strand the app on Select-bot (no auto-select), so this spec
 * injects a profile/bot selection too — the same pattern every suite uses.
 */
const {
  apiBase,
  check,
  getParentTokens,
  listProfiles,
  listBots,
  completeOnboarding,
  injectAsyncStorage,
  tokensManifest,
  sleep,
  authed,
} = require('./seedHelpers');

describe('Smoke: inject+relaunch reproduction', () => {
  beforeAll(async () => {
    const tokens = await getParentTokens();
    // Landing on /chat requires finished onboarding; other suites (05)
    // reset the flag, so re-complete it here.
    await completeOnboarding(tokens.access);
    let profiles = await listProfiles(tokens.access);
    if (profiles.filter((p) => !p.deleted_at).length === 0) {
      // PR102 seedHelpers: authed(accessToken, endpoint, {method, body}) returns parsed JSON (throws on HTTP error).
      const created = await authed(tokens.access, '/profiles.json', { method: 'POST', body: { name: 'Smoke Kid' } });
      check(created && created.profile_id, 'seed profile create failed');
      profiles = await listProfiles(tokens.access);
    }
    let bots = await listBots(tokens.access);
    if (bots.filter((b) => !b.deleted_at).length === 0) {
      const created = await authed(tokens.access, '/bots.json', { method: 'POST', body: { name: 'Smoke Bot' } });
      check(created && created.bot_id, 'seed bot create failed');
      bots = await listBots(tokens.access);
    }
    const profile = profiles.find((p) => !p.deleted_at);
    const bot = bots.find((b) => !b.deleted_at);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await sleep(2000);
    await device.terminateApp();
    injectAsyncStorage(
      device.id,
      tokensManifest(tokens, {
        profile: JSON.stringify(profile),
        bot: JSON.stringify(bot),
      })
    );
    await device.launchApp({ newInstance: true });
    console.log(`smoke seeded against ${apiBase()}`);
  }, 120000);

  it('reaches chat', async () => {
    try {
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(15000);
    } catch (e) {
      await device.takeScreenshot('smoke-failure-state');
      throw e;
    }
  }, 60000);
});
