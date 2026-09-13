import { fetchChats, fetchChatMessages } from '../../api/chats';
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

  it('passes persisted agent_events through on history fetch', async () => {
    const pageChip = { kind: 'page', pageId: 'p1', name: 'Minecraft Guide' };
    (apiClient as jest.Mock).mockResolvedValueOnce({
      ok: true,
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          { text: 'done', image_url: null, role: 'assistant', agent_events: [pageChip] },
        ],
      },
    });

    const response = await fetchChatMessages('chat-1', 1);

    expect(response?.results).toHaveLength(1);
    expect(response?.results[0].agent_events).toEqual([pageChip]);
  });
});
