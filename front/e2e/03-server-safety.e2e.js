/**
 * Detox e2e for roadmap feature 03 — Server-Side Safety Layer.
 *
 * Visible surface exercised:
 * - A message that trips the server-side denylist (adult topics on the
 *   seeded "Safety Demo Bot", which has restrict flags ON and a custom
 *   advanced-editor prompt) gets the fixed server refusal as a normal
 *   assistant message — proving enforcement no longer depends on the client.
 * - A normal homework message still gets a real assistant reply.
 *
 * NOTE on assertions: assistant bubbles render in MarkdownRenderer's
 * WebView, so by.text can NEVER match assistant copy. This spec asserts
 * what IS assertable: the user echo (plain ThemedText), refusal/reply
 * persistence through the messages API, and screenshots of the rendered
 * bubbles. (It also never uses the chat-message-* container testIDs: they
 * repeat per message and ambiguous Detox matchers retry until timeout.)
 *
 * SEEDING (done in-spec): Safety Demo Bot (custom prompt, restrict flags
 * ON) + Open Flags Bot (flags OFF) via the public API, default model
 * attached (the safe path needs a real model; the blocked path does not).
 * On local Django the same rows work; the legacy `seed_e2e_server_safety`
 * command creates identical rows.
 *
 * Run: API_BASE_URL=... detox test e2e/03-server-safety.e2e.js -c ios.sim.debug
 */
const {
  apiBase,
  isWorkerBase,
  check,
  getParentTokens,
  getDefaultModelId,
  resetPinLockoutState,
  ensureNoPin,
  completeOnboarding,
  listProfiles,
  ensureBot,
  resetDailyUsageD1,
  authed,
  injectAsyncStorage,
  tokensManifest,
  sleep,
} = require('./seedHelpers');

const SAFETY_BOT_NAME = 'Safety Demo Bot';

// Substring of the server's fixed REFUSAL_ADULT_TOPIC copy
// (back/bots/services/safety.py). Kept in sync manually.
const BLOCKED_MESSAGE = 'tell me about porn websites';
const REFUSAL_SUBSTRING = /school-friendly/i;

async function seedProfileAndSafetyBot(access) {
  let profiles = await listProfiles(access);
  let profile = profiles.find((p) => !p.deleted_at);
  if (!profile) {
    const created = await authed(access, '/profiles.json', { method: 'POST', body: { name: 'Safety Kid' } });
    check(created && created.profile_id, 'seed profile create failed');
    profile = created;
  }
  // PR102's ensureBot takes {params} for extra bot fields (no auto-model:
  // pass the default model explicitly — the safe path answers for real).
  const defaultModel = await getDefaultModelId(access);
  const bot = await ensureBot(access, SAFETY_BOT_NAME, {
    params: {
      ai_model: defaultModel,
      system_prompt:
        'You are a patient math tutor for a 14-year-old. Use Socratic questioning. Never just give the final answer.',
      simple_editor: false,
      response_length: 150,
      restrict_language: true,
      restrict_adult_topics: true,
      enable_web_search: false,
    },
  });
  await ensureBot(access, 'Open Flags Bot', {
    params: {
      ai_model: defaultModel,
      system_prompt: 'You are a relaxed study buddy. All bot-level restrictions are off.',
      simple_editor: false,
      response_length: 200,
      restrict_language: false,
      restrict_adult_topics: false,
      enable_web_search: false,
    },
  });
  return { profile, bot };
}

/** Poll the newest chat's messages until `match(assistantTexts)` or timeout. */
async function pollAssistantText(access, match, timeoutMs, label) {
  const start = Date.now();
  let lastTexts = [];
  while (Date.now() - start < timeoutMs) {
    const chats = await authed(access, '/chats.json?1=1');
    const chatId = chats.results?.[0]?.chat_id;
    if (chatId) {
      const msgs = await authed(access, `/chats/${chatId}/messages.json`);
      const texts = (msgs.results || []).filter((m) => m.role === 'assistant').map((m) => m.text || '');
      lastTexts = texts;
      if (texts.some((t) => match.test(t))) return texts;
    }
    await sleep(5000);
  }
  throw new Error(`${label}: no assistant match within ${timeoutMs}ms. Got: ${JSON.stringify(lastTexts).slice(0, 300)}`);
}

describe('Server-Side Safety E2E Flow (Real API)', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await getParentTokens();
    // D1-only (throws on Django, where the seed command owns lockout state).
    if (isWorkerBase()) await resetPinLockoutState();
    await ensureNoPin(tokens.access);
    await completeOnboarding(tokens.access);
    const { profile, bot } = await seedProfileAndSafetyBot(tokens.access);

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
    // Quota hermeticity, post-launch (see 06): the seeded rates make a few
    // model turns exceed the daily cap, and any account-timezone flip voids
    // the worker's usage baseline — so reset after boot settles, not before.
    if (isWorkerBase()) await resetDailyUsageD1();
    console.log(`safety demo seeded against ${apiBase()}`);
  }, 180000);

  it('refuses an adult-topic message via the server-side filter (no model call)', async () => {
    await element(by.id('chat-input')).typeText(BLOCKED_MESSAGE);
    await element(by.id('send-button')).tap();

    // The user message echoes back (plain text bubble)…
    await waitFor(element(by.text(BLOCKED_MESSAGE))).toBeVisible().withTimeout(15000);
    // …and the fixed server refusal persists as the assistant turn
    // (back/bots/services/safety.py). Generous timeout: the block itself
    // needs no model call, but worker-side persistence can lag. Poll budget
    // is 150s, so the per-test timeout must exceed it (>=180s).
    await pollAssistantText(tokens.access, REFUSAL_SUBSTRING, 150000, 'server refusal');
    await device.takeScreenshot('safety-refusal-rendered');
  }, 180000);

  it('still answers normal homework messages after a block', async () => {
    // Timestamped so runs never collide with leftover probe messages; the
    // capital answer still matches /paris/i server-side.
    const homework = `What is the capital of France? TS${Date.now()}`;
    await element(by.id('chat-input')).typeText(homework);
    await element(by.id('send-button')).tap();

    await waitFor(element(by.text(homework))).toBeVisible().withTimeout(15000);
    // Safe path goes through the real model, so allow a generous timeout.
    await pollAssistantText(tokens.access, /paris/i, 120000, 'homework reply');
    await device.takeScreenshot('safety-homework-rendered');
  }, 180000);
});
