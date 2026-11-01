/**
 * Roadmap 07 — Spaced Repetition Study E2E (real API)
 *
 * Flow: open deck -> start study session -> flip card -> rate
 * Again/Hard/Good/Easy -> session complete summary -> verify the next-due
 * state is reflected in the UI and via the study_queue API.
 *
 * SEEDING (done in-spec, no manage.py needed on either backend):
 *   - profile 'E2E Test Profile' + bot 'E2E Test Bot' via the public API
 *   - deck 'Cell Bio' recreated with 8 cards (3 overdue + 2 future + 3 new)
 *     via the API; due_at scheduling is a Worker D1 write (PATCH ignores
 *     due_at). On local Django an existing 8-card deck is reused as seeded
 *     by `seed_e2e_spaced_repetition --skip-checks`, otherwise the spec
 *     throws the seed hint.
 *
 * ENVIRONMENT
 * -----------
 *   API_BASE_URL  base API url (default http://localhost:8000/api)
 *   CLOUDFLARE_API_TOKEN (or CLOUDFLARE_WORKER_API_TOKEN) for the Worker
 *   D1 scheduling writes. `source ~/shared_config` (never print it).
 */
const {
  apiBase,
  isWorkerBase,
  check,
  getParentTokens,
  resetPinLockoutState,
  ensureNoPin,
  completeOnboarding,
  ensureProfile,
  ensureBot,
  authed,
  d1,
  injectAsyncStorage,
  tokensManifest,
  backToDrawer,
  openDrawer,
  sleep,
} = require('./seedHelpers');

const DECK_NAME = 'Cell Bio';

// front -> back, plus scheduling state (mirrors seed_e2e_spaced_repetition).
const CARDS = [
  ['What is anaphase?', 'Sister chromatids separate and move to opposite poles', 'due'],
  ['Define osmosis', 'Diffusion of water across a semipermeable membrane', 'due'],
  ['What organelle makes ATP?', 'The mitochondrion', 'due'],
  ['What is mitosis?', 'Cell division producing two identical daughter cells', 'future'],
  ['Function of ribosomes', 'Protein synthesis', 'future'],
  ['What is a cell membrane?', 'The phospholipid bilayer enclosing the cell', 'new'],
  ['Define photosynthesis', 'Conversion of light energy into chemical energy (glucose)', 'new'],
  ['What does DNA stand for?', 'Deoxyribonucleic acid', 'new'],
];

async function seedDeck(access, profileId) {
  // PR102 seedHelpers: authed(accessToken, endpoint, options) returns parsed JSON (throws on HTTP error).
  const list = await authed(access, `/decks.json?profileId=${profileId}`);
  check(list && Array.isArray(list.results), `decks list failed: ${JSON.stringify(list).slice(0, 200)}`);
  const existing = (list.results || []).find((d) => d.name === DECK_NAME);

  if (!isWorkerBase(apiBase())) {
    // Local Django: the seed command owns scheduling (PATCH ignores due_at).
    if (existing && (existing.card_count || 0) >= 8) return existing;
    throw new Error('Seeded deck "Cell Bio" not found — run: cd back && python manage.py seed_e2e_spaced_repetition --skip-checks');
  }

  if (existing) {
    await authed(access, `/decks/${existing.deck_id}.json`, { method: 'DELETE' });
  }
  const deck = await authed(access, '/decks.json', {
    method: 'POST',
    body: {
      name: DECK_NAME,
      description: 'Seeded deck for spaced repetition e2e tests',
      profile: profileId,
    },
  });
  check(deck && deck.deck_id, `deck create failed: ${JSON.stringify(deck).slice(0, 300)}`);
  const deckId = deck.deck_id;

  const now = Date.now();
  const dueAt = (state) =>
    state === 'due'
      ? new Date(now - 24 * 3600 * 1000).toISOString()
      : state === 'future'
        ? new Date(now + 7 * 24 * 3600 * 1000).toISOString()
        : new Date(now).toISOString();

  for (let order = 0; order < CARDS.length; order++) {
    const [front, back, state] = CARDS[order];
    const card = await authed(access, `/decks/${deckId}/flashcards.json`, {
      method: 'POST',
      body: { front, back },
    });
    check(card && card.flashcard_id, `card create failed: ${JSON.stringify(card).slice(0, 200)}`);
    // PATCH ignores due_at, so schedule directly (scoped to this deck).
    await d1(
      'UPDATE bots_flashcard SET due_at = ?, interval_days = 0, ease = 2.5, reps = 0, lapses = 0, last_reviewed_at = NULL WHERE deck_id = (SELECT id FROM bots_deck WHERE deck_id = ?) AND "order" = ?',
      [dueAt(state), deckId, order]
    );
  }

  const verify = await authed(access, `/decks.json?profileId=${profileId}`);
  const row = (verify.results || []).find((d) => d.name === DECK_NAME);
  check(row, 'seeded deck missing after create');
  return row;
}

async function studyCurrentCard(rating) {
  // Flip the card, then rate it.
  await waitFor(element(by.id('study-card'))).toBeVisible().withTimeout(10000);
  await element(by.id('study-card')).tap();
  await waitFor(element(by.id(`study-rating-${rating}`))).toBeVisible().withTimeout(10000);
  await element(by.id(`study-rating-${rating}`)).tap();
}

describe('Spaced Repetition Study E2E Flow (Real API)', () => {
  let deckId;

  beforeAll(async () => {
    const tokens = await getParentTokens();
    // resetPinLockoutState is D1-only (seed_e2e_spaced_repetition owns this
    // on Django, where the D1 scheduling writes below are also skipped).
    if (isWorkerBase()) await resetPinLockoutState();
    // Profile/bot writes need no reauth once the PIN is cleared (and the
    // study flow has no PIN gate, so leave it cleared).
    await ensureNoPin(tokens.access);
    await completeOnboarding(tokens.access);
    const profile = await ensureProfile(tokens.access, 'E2E Test Profile');
    const bot = await ensureBot(tokens.access, 'E2E Test Bot');
    const deck = await seedDeck(tokens.access, profile.profile_id);
    deckId = deck.deck_id;

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
    // Land on /chat before backing out: backToDrawer taps the chat screen's
    // header back button, so the composer must be visible first (a slow boot
    // that is still settling would mistap).
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(30000);
    // /chat has no drawer: back out to the chat list first (back-button
    // pattern), then open the drawer from there.
    await backToDrawer();
  }, 180000);

  it('should run a study session with all four ratings', async () => {
    // Open Flashcards from the drawer. The drawer may still be open from
    // beforeAll's backToDrawer (in which case the menu button is covered and
    // not hittable): tap the item directly when it is already visible.
    try {
      await waitFor(element(by.id('drawer-item-flashcards'))).toBeVisible().withTimeout(5000);
    } catch {
      await openDrawer();
    }
    await element(by.id('drawer-item-flashcards')).tap();

    // Open the seeded deck.
    await waitFor(element(by.id(`deck-row-${deckId}`))).toBeVisible().withTimeout(15000);
    await element(by.id(`deck-row-${deckId}`)).tap();

    // Start studying (button reads "Study (N)").
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('study-button')).tap();

    // Rate six due cards: every rating once, then two more Goods.
    const ratings = ['again', 'hard', 'good', 'easy', 'good', 'good'];
    for (const rating of ratings) {
      await studyCurrentCard(rating);
    }

    // Session complete summary: reviewed count + next due preview.
    await waitFor(element(by.id('study-session-complete'))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id('study-complete-done'))).toBeVisible().withTimeout(5000);
    await element(by.id('study-complete-done')).tap();
  }, 180000);

  it('should reflect next-due state afterwards', async () => {
    // All rated cards are scheduled hours out, so the due queue empties.
    // NOTE: plain-value check, not Detox expect (it only matches elements).
    const tokens = await getParentTokens();
    const response = await fetch(`${apiBase()}/decks/${deckId}/study_queue.json?mode=due`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    });
    check(response.ok, `study_queue failed: ${response.status}`);
    const queue = await response.json();
    check(Array.isArray(queue), 'study_queue did not return an array');
    check(queue.length === 0, `due queue not empty: ${queue.length} left`);

    // We are back on the deck detail after Done; studying again shows the
    // "nothing due" state instead of cards.
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('study-button')).tap(); // reads "Study" without a count
    await waitFor(element(by.id('study-all-anyway'))).toBeVisible().withTimeout(10000);

    // Leave the study screen, then go up to the deck list.
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('header-back-button')).tap();
    await waitFor(element(by.id(`deck-row-${deckId}`))).toBeVisible().withTimeout(10000);

    // Deck list no longer shows a red due badge for this deck.
    await waitFor(element(by.id(`deck-due-badge-${deckId}`))).toBeNotVisible().withTimeout(10000);
  }, 120000);
});
