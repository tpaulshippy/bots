import {
  fetchActivityChat,
  fetchActivityChats,
  fetchActivitySummary,
} from '../../api/activity';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url: string) => {
    if (url.startsWith('/activity/chats.json')) {
      return Promise.resolve({
        ok: true,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              chat_id: 'chat-123',
              title: 'Can you help with fractions?',
              profile: { profile_id: 'profile-1', name: 'Maya' },
              bot: { bot_id: 'bot-1', name: 'Penelope', color: '#5B8DEF', icon: null },
              message_count: 2,
              last_message_preview: 'Of course! What part of fractions?',
              last_message_at: '2026-08-25T10:00:00Z',
              safety_event_count: 0,
            },
          ],
        },
      });
    }

    if (url.startsWith('/activity/summary.json')) {
      return Promise.resolve({
        ok: true,
        data: {
          profiles: [
            {
              profile_id: 'profile-1',
              name: 'Maya',
              chat_count: 5,
              message_count: 40,
              safety_event_count: 1,
              top_bots: [{ name: 'Penelope', count: 3 }],
            },
          ],
        },
      });
    }

    if (url.startsWith('/activity/chats/chat-123.json')) {
      return Promise.resolve({
        ok: true,
        data: {
          chat_id: 'chat-123',
          title: 'Can you help with fractions?',
          profile: { profile_id: 'profile-1', name: 'Maya' },
          bot: { bot_id: 'bot-1', name: 'Penelope', color: null, icon: null },
          message_count: 2,
          messages: [
            {
              message_id: 'm-1',
              order: 0,
              role: 'user',
              text: 'Can you help with fractions?',
              created_at: '2026-08-25T10:00:00Z',
              image_url: null,
            },
            {
              message_id: 'm-2',
              order: 1,
              role: 'assistant',
              text: 'Of course!',
              created_at: '2026-08-25T10:01:00Z',
              image_url: null,
            },
          ],
          safety_events: [],
        },
      });
    }

    return Promise.resolve({ ok: true, data: null });
  }),
}));

const lastCalledUrl = (): string => {
  const { apiClient } = jest.requireMock('../../api/apiClient');
  return apiClient.mock.calls[apiClient.mock.calls.length - 1][0] as string;
};

describe('Activity API', () => {
  describe('fetchActivityChats', () => {
    it('returns the inbox list with preview and counts', async () => {
      const response = await fetchActivityChats();

      expect(lastCalledUrl()).toBe('/activity/chats.json');
      expect(response?.results).toHaveLength(1);
      expect(response?.results[0].message_count).toBe(2);
      expect(response?.results[0].last_message_preview).toContain('fractions');
      expect(response?.results[0].safety_event_count).toBe(0);
    });

    it('passes filters as query params', async () => {
      await fetchActivityChats({
        profileId: 'profile-1',
        hasSafetyEvent: true,
        page: 2,
      });

      expect(lastCalledUrl()).toBe(
        '/activity/chats.json?profileId=profile-1&hasSafetyEvent=true&page=2'
      );
    });

    it('omits empty filters and page=1', async () => {
      await fetchActivityChats({ profileId: null, page: null });

      expect(lastCalledUrl()).toBe('/activity/chats.json');
    });
  });

  describe('fetchActivityChat', () => {
    it('fetches the read-only transcript by chat id', async () => {
      const response = await fetchActivityChat('chat-123');

      expect(lastCalledUrl()).toBe('/activity/chats/chat-123.json');
      expect(response?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(response?.safety_events).toEqual([]);
    });
  });

  describe('fetchActivitySummary', () => {
    it('defaults to a 7 day window', async () => {
      const response = await fetchActivitySummary();

      expect(lastCalledUrl()).toBe('/activity/summary.json?days=7');
      expect(response?.profiles[0]).toMatchObject({
        name: 'Maya',
        chat_count: 5,
        top_bots: [{ name: 'Penelope', count: 3 }],
      });
    });

    it('supports custom windows', async () => {
      await fetchActivitySummary(30);

      expect(lastCalledUrl()).toBe('/activity/summary.json?days=30');
    });
  });
});
