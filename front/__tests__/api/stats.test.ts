import { fetchStats } from '../../api/stats';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url) => {
    if (url.match(/\/stats\.json/)) {
      return Promise.resolve({
        ok: true,
        data: {
          profile_id: 'kid-1',
          name: 'Maya',
          current_streak: 3,
          longest_streak: 5,
          total_chats: 4,
          total_messages: 21,
          total_reviews: 12,
          chatted_today: true,
          studied_today: true,
          week: [
            { date: '2026-09-02', messages: 0, reviews: 0 },
            { date: '2026-09-03', messages: 2, reviews: 0 },
            { date: '2026-09-04', messages: 0, reviews: 0 },
            { date: '2026-09-05', messages: 1, reviews: 3 },
            { date: '2026-09-06', messages: 0, reviews: 0 },
            { date: '2026-09-07', messages: 4, reviews: 0 },
            { date: '2026-09-08', messages: 1, reviews: 2 },
          ],
        },
      });
    }
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('Stats API', () => {
  it('should fetch gamification stats for a profile', async () => {
    const stats = await fetchStats('kid-1');

    expect(stats).not.toBeNull();
    expect(stats?.current_streak).toBe(3);
    expect(stats?.longest_streak).toBe(5);
    expect(stats?.total_reviews).toBe(12);
    expect(stats?.studied_today).toBe(true);
    expect(stats?.week).toHaveLength(7);
  });
});
