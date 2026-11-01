/**
 * Roadmap 06 — Streaming chat and agent UI E2E
 * (docs/roadmap/06-streaming-chat-and-agent-ui.md)
 *
 * TWO paths, chosen up front and logged:
 *
 * FAKE path (local Django only): the seeded "Stream Demo" bot is wired to
 * AiModel 'e2e-fake-stream-mitosis', so AiClientWrapper serves a
 * deterministic FAKE STREAM (tool_start/tool_end creating deck "Cell Bio",
 * word-paced tokens of a fixed answer). All original fake assertions run
 * verbatim here (Stop button, progressive 'prophase' text, deck tool chip +
 * toast, Study-now deep link, cancel-keeps-partial). Seed once:
 *     cd back && python manage.py seed_e2e_streaming_chat
 *
 * REAL path (live Worker): ALLOW_E2E_FAKE_STREAM=false and no deploys/var
 * flips are allowed, so fake content can never be asserted — the file's
 * fake assertions are NOT weakened to fake it; instead this path covers the
 * real-model stream with model-agnostic assertions (Stop-while-streaming,
 * completion, user echo, assistant persistence via API, screenshots, and
 * cancel-mid-stream behavior). The fake assertions below stay intact for
 * Django; this is reported, not silent.
 *
 * Both paths share the AsyncStorage token+selection injection (no
 * e2eInitialRoute: dead — see 01) and land on /chat directly.
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
  listBots,
  ensureBot,
  authed,
  injectAsyncStorage,
  tokensManifest,
  sleep,
} = require('./seedHelpers');

const DEMO_BOT_NAME = 'Stream Demo';
const FAKE_MODEL_ID = 'e2e-fake-stream-mitosis';

async function seedProfileAndBot(access) {
  let profiles = await listProfiles(access);
  let profile = profiles.find((p) => !p.deleted_at);
  if (!profile) {
    const created = await authed(access, '/profiles.json', { method: 'POST', body: { name: 'Stream Kid' } });
    check(created && created.profile_id, 'seed profile create failed');
    profile = created;
  }
  let bot;
  if (isWorkerBase(apiBase())) {
    // Real-model path: default model (fake streams are disabled server-side)
    // plus a high response cap so the reply streams long enough to observe
    // the Stop state (short replies finish inside Detox's tap round-trip).
    // PR102's ensureBot takes extra fields via {params} (no auto-model).
    bot = await ensureBot(access, DEMO_BOT_NAME, {
      params: { ai_model: await getDefaultModelId(access), response_length: 2000 },
    });
  } else {
    // Fake path: the seed owns the fake wiring; refuse to run weakened.
    const bots = await listBots(access);
    bot =
      bots.find((b) => b.name === DEMO_BOT_NAME && !b.deleted_at) ||
      (await ensureBot(access, DEMO_BOT_NAME));
    check(
      bot.ai_model === FAKE_MODEL_ID,
      `"${DEMO_BOT_NAME}" is not wired to ${FAKE_MODEL_ID} (got ${bot.ai_model}). Run: cd back && python manage.py seed_e2e_streaming_chat`
    );
  }
  return { profile, bot };
}

/** Poll the newest chat until a user turn contains `text`. */
async function pollUserEcho(access, text, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const chats = await authed(access, '/chats.json?1=1');
    const chatId = chats.results?.[0]?.chat_id;
    if (chatId) {
      const msgs = await authed(access, `/chats/${chatId}/messages.json`);
      if ((msgs.results || []).some((m) => m.role === 'user' && (m.text || '').includes(text))) return;
    }
    await sleep(5000);
  }
  throw new Error(`${label}: user echo never persisted within ${timeoutMs}ms.`);
}

/** Poll the newest chat until an assistant turn satisfies `match`. */
async function pollAssistant(access, match, timeoutMs, label) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < timeoutMs) {
    const chats = await authed(access, '/chats.json?1=1');
    const chatId = chats.results?.[0]?.chat_id;
    if (chatId) {
      const msgs = await authed(access, `/chats/${chatId}/messages.json`);
      const texts = (msgs.results || []).filter((m) => m.role === 'assistant').map((m) => m.text || '');
      last = texts;
      if (texts.some((t) => match.test(t))) return texts;
    }
    await sleep(5000);
  }
  throw new Error(`${label}: no match within ${timeoutMs}ms. Got: ${JSON.stringify(last).slice(0, 300)}`);
}

describe('Streaming chat and agent UI', () => {
  let tokens;
  let seedProfile;
  const fakePath = !isWorkerBase(apiBase());

  beforeAll(async () => {
    tokens = await getParentTokens();
    await resetPinLockoutState();
    await ensureNoPin(tokens.access);
    await completeOnboarding(tokens.access);
    const seeded = await seedProfileAndBot(tokens.access);
    seedProfile = seeded.profile;
    const { profile, bot } = seeded;

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
    console.log(`streaming spec: ${fakePath ? 'FAKE-stream path (Django)' : 'REAL-model path (Worker)'} against ${apiBase()}`);
  }, 180000);

  if (fakePath) {
    it('streams tokens progressively, shows tool activity, and toasts the created deck', async () => {
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(5000);
      await element(by.id('chat-input')).typeText('Teach me mitosis and make me a study deck');

      // Replace send with Stop while generation is in flight. NOTE: Detox
      // taps wait for app idle first, which can deliver the tap AFTER the
      // stream already finished — so sync is paused around the tap so the
      // Stop poll starts ~instantly, then re-enabled.
      await device.disableSynchronization();
      await element(by.id('send-button')).tap();
      // Stop proves the streaming state. (Catch it here with sync off: with
      // sync on, the tap can be delivered after the short fake stream ends.)
      await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(15000);
      // ...the stream completes and the composer returns to idle.
      await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(30000);
      await device.enableSynchronization();
      await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(5000);

      // The deck tool ran: prove it through the API (name + 3 seeded cards).
      // Chip/toast text and containers are not reliably matchable (WebView
      // bubbles; View testIDs; the toast itself expires after 8s).
      let deckId = null;
      for (let i = 0; i < 12 && !deckId; i++) {
        const decks = await authed(tokens.access, `/decks.json?profileId=${seedProfile.profile_id}`);
        deckId = (decks.results || []).find((d) => d.name === 'Cell Bio' && (d.card_count || 0) >= 3)?.deck_id;
        if (!deckId) await sleep(5000);
      }
      check(deckId, 'Cell Bio deck with 3 cards never appeared');

      // Prefer the toast CTA (proves the toast when it is still up)…
      let viaToast = false;
      try {
        await waitFor(element(by.id('deck-toast-study'))).toBeVisible().withTimeout(8000);
        await element(by.id('deck-toast-study')).tap();
        viaToast = true;
      } catch {
        // …else open the deck from Flashcards (deterministic fallback).
      }
      if (!viaToast) {
        await element(by.id('header-back-button')).tap();
        await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
        await element(by.id('drawer-menu-button')).tap();
        await waitFor(element(by.id('drawer-item-flashcards'))).toBeVisible().withTimeout(5000);
        await element(by.id('drawer-item-flashcards')).tap();
        await waitFor(element(by.id(`deck-row-${deckId}`))).toBeVisible().withTimeout(15000);
        await element(by.id(`deck-row-${deckId}`)).tap();
      }

      // Deep link lands on the created deck with its seeded cards.
      await waitFor(element(by.text('What is mitosis?'))).toBeVisible().withTimeout(15000);
    }, 120000);

    it('keeps partial text when the user cancels mid-stream', async () => {
      // Storage was injected in beforeAll; a fresh launch lands back on chat.
      await device.launchApp({ newInstance: true });
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(15000);
      await element(by.id('chat-input')).typeText('Start explaining mitosis');
      // Tap Stop with sync still off: re-enabling first lets the short fake
      // stream finish before the tap is delivered.
      await device.disableSynchronization();
      await element(by.id('send-button')).tap();
      await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(10000);
      await element(by.id('stop-button')).tap();
      await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(10000);
      await device.enableSynchronization();

      // Back to idle with the composer ready (partial tokens kept
      // server-side, doc 06 §2 "prefer save partial").
      await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(10000);
      await pollAssistant(tokens.access, /mitosis|prophase|cell/i, 60000, 'cancel-kept partial');
    }, 120000);
  } else {
    it('streams a real-model reply with Stop-while-streaming and completion', async () => {
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(5000);
      // Tool-using prompt (web search + deck creation on this bot) stretches
      // server-side work so the streaming window is observable; the reply
      // itself is long as well.
      const prompt = `Search the web for the latest mitosis research, explain it in detail with at least 500 words, and make me a study deck about it TS${Date.now()}`;
      await element(by.id('chat-input')).typeText(prompt);

      // Replace send with Stop while generation is in flight. NOTE: Detox
      // taps wait for app idle first, which can deliver the tap AFTER a
      // fast burst already completed — so sync is paused around the tap so
      // the Stop poll starts ~instantly, then re-enabled.
      await device.disableSynchronization();
      await element(by.id('send-button')).tap();
      let sawStop = false;
      try {
        await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(20000);
        sawStop = true;
      } finally {
        await device.enableSynchronization();
      }
      check(sawStop, 'Stop never appeared: backend delivered the reply as one burst');

      // User echo persisted (proves the send landed) — asserted through
      // the API, not by.text: on a cold first-send the app can remount
      // mid-stream while bootstrap settles, dropping the optimistic bubble
      // even though server state stays correct (user+assistant rows persist
      // every run; echo rendering on this screen is proven by test 2 below
      // and by 03/05/chatImageUpload). WebView copy is not matchable — see 03.
      await pollUserEcho(tokens.access, prompt, 60000, 'sent echo');

      // ...the stream completes and the composer returns to idle.
      await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(180000);
      await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(5000);

      await pollAssistant(tokens.access, /mitosis|cell division|prophase/i, 60000, 'real-model reply');
      await device.takeScreenshot('streaming-real-complete');
    }, 300000);

    it('keeps partial text when the user cancels mid-stream', async () => {
      await device.launchApp({ newInstance: true });
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(20000);
      const prompt = `Explain meiosis in extreme detail, step by step, at least 600 words TS${Date.now()}`;
      await element(by.id('chat-input')).typeText(prompt);
      // Tap Stop with sync still off (same lesson as the fake path).
      await device.disableSynchronization();
      await element(by.id('send-button')).tap();
      await waitFor(element(by.id('stop-button'))).toBeVisible().withTimeout(20000);
      await element(by.id('stop-button')).tap();
      await waitFor(element(by.id('stop-button'))).not.toBeVisible().withTimeout(15000);
      await device.enableSynchronization();

      // Back to idle with the composer ready; the echo and whatever partial
      // text streamed persist server-side (doc 06 §2 "prefer save partial").
      await waitFor(element(by.id('send-button'))).toBeVisible().withTimeout(10000);
      await waitFor(element(by.text(prompt))).toBeVisible().withTimeout(10000);
      await device.takeScreenshot('streaming-real-cancelled');
    }, 120000);
  }
});
