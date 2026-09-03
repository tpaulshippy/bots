/**
 * Roadmap 07 — Spaced Repetition Study E2E (real API)
 *
 * Flow: open deck -> start study session -> flip card -> rate
 * Again/Hard/Good/Easy -> session complete summary -> verify the next-due
 * state is reflected in the UI and via the study_queue API.
 *
 * SEEDING
 * -------
 * Requires the backend seed command to have been run against the server:
 *
 *     cd back && python manage.py seed_e2e_spaced_repetition --skip-checks
 *
 * It creates (idempotently):
 *   - user  e2e-test-user / testpassword123  (+ profile + bot)
 *   - deck "Cell Bio" with 8 cards: 6 due (3 overdue + 3 new), 2 future
 * Re-running the seed resets the deck to exactly that state.
 *
 * ENVIRONMENT
 * -----------
 *   API_BASE_URL  base API url (default http://localhost:8000/api)
 *   Detox iOS simulator config as for chatImageUpload.e2e.js
 *   (bundle com.tpaulshippy.botsforkids). Auth tokens, profile and bot are
 *   injected into AsyncStorage via simctl like chatImageUpload.e2e.js.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';
const DECK_NAME = 'Cell Bio';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(
      `Backend not available at ${API_BASE} (status ${response.status}). ` +
      `Run: cd back && python manage.py seed_e2e_spaced_repetition --skip-checks`
    );
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

async function getSeedState(accessToken) {
  const [profileRes, botRes, deckRes] = await Promise.all([
    fetch(`${API_BASE}/profiles.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${API_BASE}/bots.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${API_BASE}/decks.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
  const profiles = await profileRes.json();
  const bots = await botRes.json();
  const decks = await deckRes.json();
  const deck = (decks.results || []).find((d) => d.name === DECK_NAME);
  if (!deck) throw new Error(`Seeded deck "${DECK_NAME}" not found — run the seed command`);
  return {
    profile: JSON.stringify(profiles.results[0]),
    bot: JSON.stringify(bots.results[0]),
    deckId: deck.deck_id,
    deckDueCount: deck.due_count,
  };
}

function injectAsyncStorage(udid, tokens, profile, bot) {
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
    selectedProfile: profile,
    selectedBot: bot,
    e2eTestMode: 'true',
  };

  fs.writeFileSync(path.join(asDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

async function studyCurrentCard(rating) {
  // Flip the card, then rate it.
  await waitFor(element(by.id('study-card'))).toBeVisible().withTimeout(10000);
  await element(by.id('study-card')).tap();
  await waitFor(element(by.id(`study-rating-${rating}`))).toBeVisible().withTimeout(5000);
  await element(by.id(`study-rating-${rating}`)).tap();
}

describe('Spaced Repetition Study E2E Flow (Real API)', () => {
  let deckId;

  beforeAll(async () => {
    const tokens = await getTestTokens();
    const state = await getSeedState(tokens.access);
    deckId = state.deckId;

    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await device.terminateApp();

    const udid = device.id;
    injectAsyncStorage(udid, tokens, state.profile, state.bot);

    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('drawer-menu-button'))).toBeVisible().withTimeout(15000);
  }, 120000);

  it('should run a study session with all four ratings', async () => {
    // Open Flashcards from the drawer.
    await element(by.id('drawer-menu-button')).tap();
    await waitFor(element(by.id('drawer-item-flashcards'))).toBeVisible().withTimeout(5000);
    await element(by.id('drawer-item-flashcards')).tap();

    // Open the seeded deck.
    await waitFor(element(by.id(`deck-row-${deckId}`))).toBeVisible().withTimeout(10000);
    await element(by.id(`deck-row-${deckId}`)).tap();

    // Start studying (button reads "Study (N)").
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(5000);
    await element(by.id('study-button')).tap();

    // Rate six due cards: every rating once, then two more Goods.
    const ratings = ['again', 'hard', 'good', 'easy', 'good', 'good'];
    for (const rating of ratings) {
      await studyCurrentCard(rating);
    }

    // Session complete summary: reviewed count + next due preview.
    await waitFor(element(by.id('study-session-complete'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('study-complete-done'))).toBeVisible().withTimeout(5000);
    await element(by.id('study-complete-done')).tap();
  }, 180000);

  it('should reflect next-due state afterwards', async () => {
    // All rated cards are scheduled >= 4h out, so the due queue empties.
    const tokens = await getTestTokens();
    const response = await fetch(`${API_BASE}/decks/${deckId}/study_queue/.json?mode=due`, {
      headers: { Authorization: `Bearer ${tokens.access}` },
    });
    const queue = await response.json();
    expect(Array.isArray(queue) ? queue : []).toEqual([]);

    // We are back on the deck detail after Done; studying again shows the
    // "nothing due" state instead of cards.
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('study-button')).tap(); // reads "Study" without a count
    await waitFor(element(by.id('study-all-anyway'))).toBeVisible().withTimeout(10000);

    // Leave the study screen, then go up to the deck list.
    await element(by.id('back-button')).atIndex(0).tap();
    await waitFor(element(by.id('study-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('back-button')).atIndex(0).tap();
    await waitFor(element(by.id(`deck-row-${deckId}`))).toBeVisible().withTimeout(10000);

    // Deck list no longer shows a red due badge for this deck.
    await waitFor(element(by.id(`deck-due-badge-${deckId}`))).not.toExist().withTimeout(5000);
  }, 120000);
});
