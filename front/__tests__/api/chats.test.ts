import { fetchChats, fetchChatMessages, normalizeAgentChip } from '../../api/chats';
import { apiClient } from '../../api/apiClient';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn(() =>
    Promise.resolve({
      ok: true,
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            chat_id: 'chat-1',
            title: 'Fractions help',
            modified_at: '2026-08-25T10:00:00Z',
            messages: [],
            profile: { profile_id: 'kid-1' },
            bot: {
              bot_id: 'bot-1',
              name: 'Fred',
              color: '#FF5D8F',
              icon: 'text.bubble',
            },
          },
        ],
      },
    })
  ),
}));

describe('Chats API', () => {
  it('passes the bot color and icon through to the chat list', async () => {
    const response = await fetchChats('kid-1', 1);

    expect(response?.results).toHaveLength(1);
    expect(response?.results[0].bot).toMatchObject({
      name: 'Fred',
      color: '#FF5D8F',
      icon: 'text.bubble',
    });
  });

  it('converts stored snake_case chips on history fetch', async () => {
    (apiClient as jest.Mock).mockResolvedValueOnce({
      ok: true,
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            text: 'done',
            image_url: null,
            role: 'assistant',
            agent_events: [
              { kind: 'deck', deck_id: 'd1', name: 'Cell Bio', card_count: 8 },
              { kind: 'page', page_id: 'p1', name: 'Minecraft Guide' },
            ],
          },
        ],
      },
    });

    const response = await fetchChatMessages('chat-1', 1);

    expect(response?.results).toHaveLength(1);
    expect(response?.results[0].agent_events).toEqual([
      { kind: 'deck', deckId: 'd1', name: 'Cell Bio', cardCount: 8 },
      { kind: 'page', pageId: 'p1', name: 'Minecraft Guide' },
    ]);
  });

  it('maps wire chips to domain chips', async () => {
    expect(
      normalizeAgentChip({ kind: 'deck', deck_id: 'd1', name: 'Cell Bio', card_count: 3 })
    ).toEqual({ kind: 'deck', deckId: 'd1', name: 'Cell Bio', cardCount: 3 });
    expect(
      normalizeAgentChip({ kind: 'page', page_id: 'p1', name: 'Guide' })
    ).toEqual({ kind: 'page', pageId: 'p1', name: 'Guide' });
    expect(
      normalizeAgentChip({ kind: 'sources', label: '🌐 2 results' })
    ).toEqual({ kind: 'sources', label: '🌐 2 results' });
  });
});
