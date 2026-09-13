import { fetchProfiles, upsertProfile, tryFetchProfiles } from '../../api/profiles';
import { apiClient } from '../../api/apiClient';

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
      expect(response).not.toBeNull();

      expect(response).toBeDefined();
      expect(response!.results.length).toBeGreaterThan(0);
      const profile = response!.results[0];
      expect(profile).toHaveProperty('profile_id');
      expect(profile).toHaveProperty('name');
    });
  });

  describe('tryFetchProfiles', () => {
    it('resolves a genuinely empty list (distinct from failure)', async () => {
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { results: [], count: 0 },
      });

      await expect(tryFetchProfiles()).resolves.toEqual({
        results: [],
        count: 0,
      });
    });

    it('resolves null on 404, 5xx, and transport failure', async () => {
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        data: { detail: 'Not found.' },
      });
      await expect(tryFetchProfiles()).resolves.toBeNull();

      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: null,
      });
      await expect(tryFetchProfiles()).resolves.toBeNull();

      (apiClient as jest.Mock).mockRejectedValueOnce(
        new Error('Network request failed')
      );
      await expect(tryFetchProfiles()).resolves.toBeNull();
    });

    it('rethrows auth errors so expired sessions reach login', async () => {
      (apiClient as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), {
          name: 'UnauthorizedError',
        })
      );

      await expect(tryFetchProfiles()).rejects.toMatchObject({
        name: 'UnauthorizedError',
      });
    });
  });

  describe('upsertProfile with a photo', () => {
    const profile = {
      id: 5,
      profile_id: 'p1',
      name: 'Maya',
      oauth_email: null,
      deleted_at: null,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('sends multipart with the image when a photo URI is given', async () => {
      await upsertProfile(profile, { photoUri: 'file:///photo.jpg' });
      expect(apiClient).toHaveBeenCalledWith(
        '/profiles/5.json',
        expect.objectContaining({ method: 'PUT' })
      );
      const body = (apiClient as jest.Mock).mock.calls[0][1].body;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('name')).toBe('Maya');
      // The apiClient skips the JSON content type for FormData so the
      // image bytes ride along (same as chat image uploads).
      expect(
        (apiClient as jest.Mock).mock.calls[0][1].headers
      ).toBeUndefined();
    });

    it('sends remove_photo when the photo is cleared without a replacement', async () => {
      await upsertProfile(profile, { photoUri: null, removePhoto: true });
      const body = (apiClient as jest.Mock).mock.calls[0][1].body;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('remove_photo')).toBe('true');
    });

    it('stays on the JSON path when the photo is unchanged', async () => {
      await upsertProfile(profile);
      const body = (apiClient as jest.Mock).mock.calls[0][1].body;
      expect(typeof body).toBe('string');
      expect(JSON.parse(body)).toMatchObject({ name: 'Maya' });
    });
  });
});
