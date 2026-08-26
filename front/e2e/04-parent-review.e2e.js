/**
 * Roadmap 04 — Parent Conversation Review e2e
 * (docs/roadmap/04-parent-conversation-review.md)
 *
 * Walks the parent review surface against a REAL backend API:
 *   app boot -> kid chat area -> Settings (PIN gate)
 *     -> Activity inbox (second PIN gate, per-screen PinWrapper)
 *     -> summary chips per kid -> open read-only transcript
 *     -> verify bubbles render and no composer exists.
 *
 * SEEDING (run once before this suite, from back/):
 *   python manage.py loaddata bots/fixtures/ai_models.json
 *   python manage.py migrate && python manage.py seed_e2e_parent_review
 *   -> creates 'e2e-test-user' / 'testpassword123' with parent PIN **1234**,
 *      kids Maya + Sam, bots Penelope + Math Bot and several chats spread
 *      over the last few days (one ending in an assistant refusal turn).
 *
 * ENV:
 *   API_BASE_URL  base of the Django API (default http://localhost:8000/api)
 *   Start the backend with: python manage.py runserver
 *
 * Auth tokens are fetched at runtime and passed through the e2e deep link;
 * no credentials or bearer tokens are committed to this test.
 */
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const PARENT_PIN = '1234';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) {
    throw new Error(`Backend not available at ${API_BASE}. Status: ${response.status}. Is it seeded (seed_e2e_parent_review)?`);
  }
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

async function getTestProfileAndBot(accessToken) {
  const [profileRes, botRes] = await Promise.all([
    fetch(`${API_BASE}/profiles.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`${API_BASE}/bots.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);
  const profiles = await profileRes.json();
  const bots = await botRes.json();
  return {
    profile: JSON.stringify(profiles.results[0]),
    bot: JSON.stringify(bots.results[0]),
  };
}

describe('Parent Conversation Review E2E Flow (Real API)', () => {
  beforeAll(async () => {
    const tokens = await getTestTokens();
    const { profile, bot } = await getTestProfileAndBot(tokens.access);
    const url = [
      `botsforkids://e2e-test?access=${encodeURIComponent(tokens.access)}`,
      `refresh=${encodeURIComponent(tokens.refresh)}`,
      `profile=${encodeURIComponent(profile)}`,
      `bot=${encodeURIComponent(bot)}`,
    ].join('&');

    await device.launchApp({ newInstance: true, url });
    await device.disableSynchronization();
    await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(30000);
  }, 120000);

  it('parent opens the Activity inbox from Settings behind the PIN gate', async () => {
    // Kid chat -> chat history, where the drawer lives.
    await element(by.id('back-button')).tap();
    await waitFor(element(by.id('menu-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('menu-button')).tap();
    await element(by.text('Settings')).tap();

    // Parent-area PIN gate (roadmap 02 dependency).
    await waitFor(element(by.id('pin-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('pin-input')).typeText(PARENT_PIN);

    // Settings -> Activity entry point.
    await waitFor(element(by.id('settings-activity-item'))).toBeVisible().withTimeout(10000);
    await element(by.id('settings-activity-item')).tap();

    // The inbox gates itself again with its own PinWrapper instance.
    await waitFor(element(by.id('pin-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('pin-input')).typeText(PARENT_PIN);

    // Inbox content: summary chips + recent chats list.
    await waitFor(element(by.id('activity-summary-chips'))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id('activity-chat-row-0'))).toBeVisible().withTimeout(15000);
  }, 90000);

  it('parent opens a transcript read-only and sees the full history', async () => {
    // Row 0 is the most recent chat seeded for Maya/Penelope.
    await element(by.id('activity-chat-row-0')).tap();

    await waitFor(element(by.id('activity-transcript-subtitle')))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.id('activity-transcript-subtitle'))).toBeVisible();

    // Full transcript renders both roles (not limited to last 10 here).
    await waitFor(element(by.id('chat-message-user'))).toBeVisible().withTimeout(10000);
    await waitFor(element(by.id('chat-message-assistant'))).toBeVisible().withTimeout(10000);

    // Read-only by design: no composer in the parent view.
    await expect(element(by.id('chat-input'))).not.toBeVisible();
    await expect(element(by.id('send-button'))).not.toBeVisible();
  }, 90000);
});
