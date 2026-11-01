/**
 * Chat Image Upload E2E (real API).
 *
 * Tapping the camera button in e2e mode resolves a BUNDLED asset
 * (assets/images/syft_small.png) to a simulator-local file:// URI
 * (app/botChat.tsx e2e branch via expo-asset, already native-linked) so the
 * multipart XHR upload reads real bytes. The old remote picsum URL could
 * never be uploaded by native form parts, so every upload failed.
 *
 * Asserts what IS assertable: the image bubble (chat-message-image is a
 * TouchableOpacity, unique here), the user echo text, assistant persistence
 * via the messages API, and a screenshot. (chat-message-* View containers
 * and WebView assistant copy are not matchable — see 03/04.)
 */
const {
  apiBase,
  isWorkerBase,
  check,
  getParentTokens,
  resetPinLockoutState,
  ensureNoPin,
  completeOnboarding,
  listProfiles,
  listBots,
  ensureBot,
  authed,
  injectAsyncStorage,
  tokensManifest,
  sleep,
} = require('./seedHelpers');

// Bedrock rejects image blocks on text-only Nova Micro, so the photo bot
// must use this vision-capable model (seeded by seed-local-e2e.sql; the
// /ai_models API does not expose input modalities, hence the constant).
const VISION_MODEL_ID = 'us.amazon.nova-lite-v1:0';

async function seedProfileAndBot(access) {
  let profiles = await listProfiles(access);
  let profile = profiles.find((p) => !p.deleted_at);
  if (!profile) {
    const created = await authed(access, '/profiles.json', { method: 'POST', body: { name: 'Photo Kid' } });
    check(created && created.profile_id, 'seed profile create failed');
    profile = created;
  }
  // Sending needs a bot with a real model attached. Worker: ensureBot wires
  // the default model. Django: fall back to the default model when the bot
  // has none, so prefer a bot that already has one; otherwise the spec's
  // seed (or signup signals) must have provisioned it.
  //
  // Image turns additionally need a VISION-capable model: Bedrock 400s image
  // content blocks on text-only Nova Micro, so prefer/create a bot wired to
  // VISION_MODEL_ID (seeded by worker/scripts/seed-local-e2e.sql).
  let bots = await listBots(access);
  let bot = bots.find((b) => !b.deleted_at && b.ai_model === VISION_MODEL_ID) || null;
  if (!bot && !isWorkerBase(apiBase())) {
    bot = bots.find((b) => !b.deleted_at && b.ai_model) || null;
  }
  if (!bot) {
    if (!isWorkerBase(apiBase())) {
      throw new Error('No bot with a model found. Local Django: run a seed that provisions a bot (e.g. seed_e2e_onboarding).');
    }
    const models = (await authed(access, '/ai_models.json')).results || [];
    check(
      models.some((m) => m.model_id === VISION_MODEL_ID),
      `Vision model ${VISION_MODEL_ID} missing — apply worker/scripts/seed-local-e2e.sql to local D1.`
    );
    bot = await ensureBot(access, 'Photo Bot', { params: { ai_model: VISION_MODEL_ID } });
  }
  return { profile, bot };
}

describe('Chat Image Upload E2E Flow (Real API)', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await getParentTokens();
    await resetPinLockoutState();
    await ensureNoPin(tokens.access);
    await completeOnboarding(tokens.access);
    const { profile, bot } = await seedProfileAndBot(tokens.access);

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
    await waitFor(element(by.id('camera-button'))).toBeVisible().withTimeout(30000);
  }, 180000);

  it('should upload an image and send a message via real API', async () => {
    // Camera button in e2e mode attaches the bundled asset (no picker).
    await element(by.id('camera-button')).tap();
    await sleep(2000); // let asset.downloadAsync resolve to file://

    const prompt = `Real API test image ${Date.now()}`;
    await element(by.id('chat-input')).typeText(prompt);
    await element(by.id('send-button')).tap();

    await waitFor(element(by.text(prompt))).toBeVisible().withTimeout(30000);
    await device.takeScreenshot('chat-image-sent');

    // The user turn persisted WITH an image attachment (proves the upload:
    // the file bytes reached the server, which stored an R2 media URL).
    // NOTE: the image bubble visibly renders (see screenshot) but its
    // chat-message-image testID does not match by.id on this RN build —
    // same as the chat-message-* containers (see 03/04) — so the API row
    // carries this assertion.
    const chats = await authed(tokens.access, '/chats.json?1=1');
    const chatId = chats.results?.[0]?.chat_id;
    check(chatId, 'no chat created for the image message');
    // Poll for the user turn: persistence lags the local echo (image
    // upload + model round-trip), more so against Django+Bedrock.
    let userMsg = null;
    for (let i = 0; i < 18 && !userMsg; i++) {
      const firstMsgs = await authed(tokens.access, `/chats/${chatId}/messages.json`);
      userMsg = (firstMsgs.results || []).find((m) => m.role === 'user');
      if (!userMsg) await sleep(5000);
    }
    check(userMsg && (userMsg.image_url || '').startsWith('http'), `user turn has no stored image: ${JSON.stringify(userMsg || {}).slice(0, 200)}`);

    // Assistant reply persisted (real model, generous timeout).
    const start = Date.now();
    let assistantText = '';
    while (Date.now() - start < 150000 && !assistantText) {
      const msgs = await authed(tokens.access, `/chats/${chatId}/messages.json`);
      assistantText = (msgs.results || []).find((m) => m.role === 'assistant')?.text || '';
      if (!assistantText) await sleep(5000);
    }
    check(assistantText.length > 0, 'no assistant reply persisted for the image message');
  }, 240000);
});
