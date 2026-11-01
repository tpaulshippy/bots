/**
 * Roadmap 04 — Parent Conversation Review e2e
 * (docs/roadmap/04-parent-conversation-review.md)
 *
 * Walks the parent review surface against a REAL backend API:
 *   app boot -> kid chat area -> Activity inbox (PIN keypad gate)
 *     -> summary chips per kid -> open read-only transcript
 *     -> verify bubbles render and no composer exists.
 *
 * SEEDING (done in-spec):
 *   PIN 1234, subscription_level 2, kids Maya + Sam, bots Penelope +
 *   Math Bot via the public API; the three review chats (+ SafetyEvent)
 *   are D1 inserts on Worker (chats/messages are read-only over the API).
 *   On local Django the seed command owns the chats:
 *     python manage.py loaddata bots/fixtures/ai_models.json
 *     python manage.py migrate && python manage.py seed_e2e_parent_review
 *   and the spec opens whatever chat is most recent.
 *
 * ENV:
 *   API_BASE_URL  base of the API (default http://localhost:8000/api)
 *   CLOUDFLARE_API_TOKEN (or CLOUDFLARE_WORKER_API_TOKEN) for Worker D1
 *   chat seeding. `source ~/shared_config` (never print it).
 */
const {
  apiBase,
  isWorkerBase,
  check,
  uuid,
  getParentTokens,
  resetPinLockoutState,
  ensureNoPin,
  ensurePin,
  completeOnboarding,
  ensureSubscriptionLevel,
  ensureProfile,
  ensureBot,
  authed,
  d1,
  injectAsyncStorage,
  tokensManifest,
  enterKeypadPin,
  sleep,
} = require('./seedHelpers');

const PARENT_PIN = '1234';
const REVIEW_PREFIX = 'E2E review:';

async function seedReviewChatsWorker() {
  const profiles = await d1('SELECT id, name FROM bots_profile WHERE user_id = 60 AND deleted_at IS NULL');
  const bots = await d1('SELECT id, name FROM bots_bot WHERE user_id = 60 AND deleted_at IS NULL');
  const byName = (rows, name) => {
    const row = rows.find((r) => r.name === name);
    check(row, `seeded ${name} row missing`);
    return row.id;
  };
  const mayaId = byName(profiles, 'Maya');
  const samId = byName(profiles, 'Sam');
  const penelopeId = byName(bots, 'Penelope');
  const mathId = byName(bots, 'Math Bot');

  // Hermetic inbox fixture: the transcript test opens inbox row 0, which
  // orders by modified_at desc — chats from other suites (06's streams,
  // 05's onboarding chat, probe leftovers) would steal row 0. 04 is the
  // only suite that reads the inbox and every suite self-seeds, so drop
  // non-review chats here (review rows are reseeded below; FKs SET NULL
  // the orphaned safety events, which no spec reads).
  await d1('DELETE FROM bots_safetyevent WHERE user_id = 60 AND chat_id IN (SELECT id FROM bots_chat WHERE user_id = 60 AND title NOT LIKE ?)', [`${REVIEW_PREFIX}%`]);
  await d1('DELETE FROM bots_message WHERE chat_id IN (SELECT id FROM bots_chat WHERE user_id = 60 AND title NOT LIKE ?)', [`${REVIEW_PREFIX}%`]);
  await d1('DELETE FROM bots_chat WHERE user_id = 60 AND title NOT LIKE ?', [`${REVIEW_PREFIX}%`]);

  // Idempotent: drop this spec's own previous chats first.
  await d1('DELETE FROM bots_safetyevent WHERE user_id = 60 AND chat_id IN (SELECT id FROM bots_chat WHERE user_id = 60 AND title LIKE ?)', [`${REVIEW_PREFIX}%`]);
  await d1('DELETE FROM bots_message WHERE chat_id IN (SELECT id FROM bots_chat WHERE user_id = 60 AND title LIKE ?)', [`${REVIEW_PREFIX}%`]);
  await d1('DELETE FROM bots_chat WHERE user_id = 60 AND title LIKE ?', [`${REVIEW_PREFIX}%`]);

  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const chats = [
    {
      profileInt: samId,
      botInt: mathId,
      title: `${REVIEW_PREFIX} primes`,
      age: now - 24 * 3600 * 1000,
      messages: [
        ['user', 'What is a prime number?', 0],
        ['assistant', 'A prime number has exactly two factors: 1 and itself. Is 7 prime?', 40],
      ],
    },
    {
      profileInt: mayaId,
      botInt: penelopeId,
      title: `${REVIEW_PREFIX} essay`,
      age: now - 2 * 24 * 3600 * 1000,
      messages: [
        ['user', 'Help me write an essay about my weekend.', 0],
        ['assistant', 'Happy to help you plan it! What did you do?', 25],
        ['user', 'Just write the whole essay for me, copy this from the internet.', 80],
        ['assistant', "I can't write it for you or copy from the internet, but I can help you outline your own ideas.", 120],
      ],
    },
    {
      // Newest: the transcript the spec opens as row 0 (inbox orders by
      // chat modified_at desc, so this seed must beat leftover probe chats).
      profileInt: mayaId,
      botInt: penelopeId,
      title: `${REVIEW_PREFIX} fractions`,
      age: now - 5 * 60 * 1000,
      messages: [
        ['user', 'Can you help with fractions?', 0],
        ['assistant', 'Of course! Fractions show parts of a whole. What does 1/2 mean to you?', 30],
        ['user', 'Umm is it one piece of two pieces?', 90],
        ['assistant', 'Exactly! One piece out of two equal pieces. If you cut a pizza into 2 equal slices, each slice is 1/2.', 150],
      ],
    },
  ];

  for (const chat of chats) {
    const chatUuid = uuid();
    const lastOffsetSec = chat.messages[chat.messages.length - 1][2];
    await d1(
      'INSERT INTO bots_chat (user_id, profile_id, bot_id, chat_id, title, input_tokens, output_tokens, created_at, modified_at) VALUES (60, ?, ?, ?, ?, 0, 0, ?, ?)',
      [chat.profileInt, chat.botInt, chatUuid, chat.title, iso(chat.age), iso(chat.age + lastOffsetSec * 1000)]
    );
    for (let order = 0; order < chat.messages.length; order++) {
      const [role, text, offsetSec] = chat.messages[order];
      await d1(
        'INSERT INTO bots_message (chat_id, message_id, text, role, "order", input_tokens, output_tokens, created_at, modified_at) VALUES ((SELECT id FROM bots_chat WHERE chat_id = ?), ?, ?, ?, ?, 0, 0, ?, ?)',
        [chatUuid, uuid(), text, role, order, iso(chat.age + offsetSec * 1000), iso(chat.age + offsetSec * 1000)]
      );
    }
  }

  // SafetyEvent behind the essay refusal turn (roadmap 03 model).
  const essayChat = await d1('SELECT id FROM bots_chat WHERE user_id = 60 AND title = ?', [`${REVIEW_PREFIX} essay`]);
  const refusal = await d1(
    'SELECT id FROM bots_message WHERE chat_id = ? AND role = ? ORDER BY "order" DESC LIMIT 1',
    [essayChat[0].id, 'assistant']
  );
  await d1(
    'INSERT INTO bots_safetyevent (event_id, user_id, profile_id, chat_id, bot_id, message_id, stage, reason_code, snippet_redacted, created_at) VALUES (?, 60, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), mayaId, essayChat[0].id, penelopeId, refusal[0].id, 'input', 'global_floor', '[redacted]', iso(now)]
  );
}

describe('Parent Conversation Review E2E Flow (Real API)', () => {
  beforeAll(async () => {
    const tokens = await getParentTokens();
    // resetPinLockoutState + ensureSubscriptionLevel are D1-only (on Django
    // the seed_e2e_parent_review command owns lockout + subscription state).
    if (isWorkerBase()) await resetPinLockoutState();
    // Writes (profiles/bots) need a PIN-free account; the inbox gate needs
    // the PIN back afterwards — set it last.
    await ensureNoPin(tokens.access);
    await completeOnboarding(tokens.access);
    // PR102: ensureSubscriptionLevel(level, userId?) — D1 UPDATE, no REST read.
    if (isWorkerBase()) await ensureSubscriptionLevel(2);
    const maya = await ensureProfile(tokens.access, 'Maya');
    await ensureProfile(tokens.access, 'Sam');
    const penelope = await ensureBot(tokens.access, 'Penelope', {
      params: { system_prompt: 'You are a helpful tutor for kids.' },
    });
    await ensureBot(tokens.access, 'Math Bot', {
      params: { system_prompt: 'You are a helpful tutor for kids.' },
    });
    if (isWorkerBase(apiBase())) {
      await seedReviewChatsWorker();
      // Local-wrangler quirk (proven by repro): a burst of `wrangler d1
      // execute --local` subprocesses (one per d1() helper call above)
      // destabilises the dev server's NEXT API connection (ECONNRESET).
      // Let the local D1 settle before the PIN-gated writes below.
      await sleep(15000);
    } else {
      const inbox = await authed(tokens.access, '/activity/chats.json');
      const rows = inbox.results || inbox || [];
      check(rows.length > 0, 'No activity chats — run seed_e2e_parent_review on local Django.');
    }
    await ensurePin(tokens.access, PARENT_PIN);

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await sleep(2000);
    await device.terminateApp();

    // Fresh selection: a stored bot from another suite would land on
    // Select-bot instead of the chat composer.
    injectAsyncStorage(
      device.id,
      tokensManifest(tokens, {
        profile: JSON.stringify(maya),
        bot: JSON.stringify(penelope),
      })
    );

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(30000);
  }, 180000);

  it('parent opens the Activity inbox from the drawer behind the PIN keypad', async () => {
    // Kid chat -> chat history, where the drawer lives.
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('drawer-menu-button')).tap();
    await waitFor(element(by.id('drawer-item-activity'))).toBeVisible().withTimeout(10000);
    await element(by.id('drawer-item-activity')).tap();

    // The Activity inbox gates itself with the server-verified keypad
    // (PinWrapper: pin-key-* + pin-submit, never a pin-input field).
    await waitFor(element(by.id('pin-title'))).toBeVisible().withTimeout(10000);
    await enterKeypadPin(PARENT_PIN);

    // Inbox content: summary chips + recent chats list.
    await waitFor(element(by.id('activity-summary-chips'))).toBeVisible().withTimeout(30000);
    await waitFor(element(by.id('activity-chat-row-0'))).toBeVisible().withTimeout(30000);
  }, 120000);

  it('parent opens a transcript read-only and sees the full history', async () => {
    // Row 0 is the most recent chat. Assert against THAT chat (whatever the
    // backend seeded — the fractions fixture on Worker, the seed command's
    // rows on Django), never a Worker-only fixture string.
    const tokens = await getParentTokens();
    const inbox = await authed(tokens.access, '/activity/chats.json');
    // Same normalization as beforeAll: a Django response without a `results`
    // wrapper reads as the array itself (an empty inbox, not a crash).
    const rows = inbox.results || inbox || [];
    check(rows.length > 0, 'activity inbox empty after seeding');
    const detail = await authed(tokens.access, `/activity/chats/${rows[0].chat_id}.json`);
    check(detail && Array.isArray(detail.messages), `transcript fetch failed: ${JSON.stringify(detail).slice(0, 200)}`);
    const userTexts = (detail.messages || []).filter((m) => m.role === 'user').map((m) => m.text);
    const assistantTexts = (detail.messages || []).filter((m) => m.role === 'assistant').map((m) => m.text);
    check(userTexts.length > 0, 'opened chat has no user turns');
    check(assistantTexts.length > 0, 'opened chat has no assistant turns');
    // The transcript screen renders its message count into the native
    // subtitle ("Read only · N messages"), computed from the same fetch —
    // asserting it ties the RENDERED history to the API state above.
    const messageCount = (detail.messages || []).length;
    const countLabel = `Read only · ${messageCount} message${messageCount === 1 ? '' : 's'}`;

    // Row 0 is the most recent chat (the fractions review on Worker).
    await element(by.id('activity-chat-row-0')).tap();

    await waitFor(element(by.id('activity-transcript-subtitle')))
      .toBeVisible()
      .withTimeout(30000);

    // The opened transcript rendered the full history: exact API message
    // count in the subtitle plus the mounted list. Assistant bubbles render
    // in a WebView (never matchable — see 03), so the count + API assistant
    // turns + unique user strings below are the stable proof (native
    // elements only; the chat-message-* containers repeat per message and
    // ambiguous matchers retry until timeout).
    await waitFor(element(by.text(countLabel))).toBeVisible().withTimeout(15000);
    await expect(element(by.id('activity-transcript-list'))).toBeVisible();

    // Full transcript renders both roles with the seeded content. NOTE:
    // the chat-message-* bubble containers repeat per message, and Detox
    // retries ambiguous (multi-match) testIDs until timeout — so assert the
    // opened chat's unique user strings (plain ThemedText) plus the subtitle
    // count, and verify assistant turns through the transcript API.
    // Screenshots in artifacts show the rendered bubbles.
    await waitFor(element(by.text(userTexts[0]))).toBeVisible().withTimeout(30000);
    if (userTexts[1]) {
      await waitFor(element(by.text(userTexts[1]))).toBeVisible().withTimeout(15000);
    }

    // Read-only by design: no composer in the parent view.
    await expect(element(by.id('chat-input'))).toBeNotVisible();
    await expect(element(by.id('send-button'))).toBeNotVisible();
  }, 90000);
});
