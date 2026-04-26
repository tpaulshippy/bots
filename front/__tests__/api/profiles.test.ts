import { fetchProfiles } from '../../api/profiles';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url, options = {}) => {
    if (url.includes('/profiles.json')) {
      return Promise.resolve({
        ok: true,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              profile_id: '550e8400-e29b-41d4-a716-446655440000',
              name: 'Test Profile',
              deleted_at: null,
              created_at: '2024-01-01T00:00:00Z',
              modified_at: '2024-01-01T00:00:00Z',
            },
          ],
        },
      });
    }
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('Profiles API', () => {
  describe('fetchProfiles', () => {
    it('should return paginated response with results and count', async () => {
      const response = await fetchProfiles();

      expect(response).not.toBeNull();
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('count');
      expect(Array.isArray(response?.results)).toBe(true);
    });

    it('should include required fields in profile items', async () => {
      const response = await fetchProfiles();

      if (response && response.results && response.results.length > 0) {
        const profile = response.results[0];
        expect(profile).toHaveProperty('profile_id');
        expect(profile).toHaveProperty('name');
      }
    });
  });
});