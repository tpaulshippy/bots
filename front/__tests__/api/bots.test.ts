import { fetchBots, fetchBot, upsertBot, tryFetchBot } from '../../api/bots';
import { apiClient } from '../../api/apiClient';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url, options = {}) => {
    const method = options.method || 'GET';
    
    if (url.includes('/bots.json')) {
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          data: {
            count: 2,
            next: null,
            previous: null,
            results: [
              {
                id: 1,
                bot_id: '550e8400-e29b-41d4-a716-446655440001',
                name: 'Test Bot 1',
                ai_model: 'test-model-1',
                system_prompt: 'You are helpful',
                simple_editor: false,
                template_name: null,
                response_length: 256,
                restrict_adult_topics: true,
                restrict_language: false,
                enable_web_search: false,
                color: '#3A86FF',
                icon: 'star',
                created_at: '2024-01-01T00:00:00Z',
                modified_at: '2024-01-01T00:00:00Z',
                deleted_at: null,
              },
            ],
          },
        });
      }
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          data: {
            id: 3,
            bot_id: '550e8400-e29b-41d4-a716-446655440003',
            name: 'New Bot',
            ai_model: 'test-model',
            system_prompt: 'You are helpful',
            simple_editor: false,
            template_name: null,
            response_length: 256,
            restrict_adult_topics: true,
            restrict_language: false,
            enable_web_search: true,
            color: null,
            icon: null,
            created_at: '2024-01-03T00:00:00Z',
            modified_at: '2024-01-03T00:00:00Z',
            deleted_at: null,
          },
        });
      }
    }
    
    if (url.match(/\/bots\/[^/]+\.json$/)) {
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          data: {
            id: 1,
            bot_id: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Test Bot 1',
            ai_model: 'test-model-1',
            system_prompt: 'You are helpful',
            simple_editor: false,
            template_name: null,
            response_length: 256,
            restrict_adult_topics: true,
            restrict_language: false,
            enable_web_search: false,
            color: '#3A86FF',
            icon: 'star',
            created_at: '2024-01-01T00:00:00Z',
            modified_at: '2024-01-01T00:00:00Z',
            deleted_at: null,
          },
        });
      }
      if (method === 'PUT') {
        return Promise.resolve({
          ok: true,
          data: {
            id: 1,
            bot_id: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Updated Bot',
            ai_model: 'test-model-1',
            system_prompt: 'You are helpful',
            simple_editor: false,
            template_name: null,
            response_length: 256,
            restrict_adult_topics: true,
            restrict_language: false,
            enable_web_search: true,
            color: '#E63946',
            icon: 'cpu',
            created_at: '2024-01-01T00:00:00Z',
            modified_at: '2024-01-02T00:00:00Z',
            deleted_at: null,
          },
        });
      }
    }
    
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('Bots API', () => {
  describe('fetchBots', () => {
    it('should return paginated response with results and count', async () => {
      const response = await fetchBots();

      expect(response).not.toBeNull();
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('count');
      expect(Array.isArray(response?.results)).toBe(true);
    });

    it('should include required fields in bot items', async () => {
      const response = await fetchBots();

      if (response && response.results && response.results.length > 0) {
        const bot = response.results[0];
        expect(bot).toHaveProperty('name');
        expect(bot).toHaveProperty('ai_model');
        expect(bot).toHaveProperty('enable_web_search');
        expect(bot).toHaveProperty('color');
        expect(bot).toHaveProperty('icon');
      }
    });
  });

  describe('upsertBot', () => {
    it('should create new bot', async () => {
      const response = await upsertBot({
        id: -1,
        bot_id: '',
        name: 'New Bot',
        ai_model: 'test-model',
        system_prompt: 'You are helpful',
        simple_editor: false,
        template_name: '',
        response_length: 256,
        restrict_adult_topics: true,
        restrict_language: false,
        enable_web_search: true,
        color: null,
        icon: null,
        deleted_at: null,
      });

      expect(response).not.toBeNull();
      expect(response?.name).toBe('New Bot');
    });

    it('should update existing bot', async () => {
      const response = await upsertBot({
        id: 1,
        bot_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Updated Bot',
        ai_model: 'test-model-1',
        system_prompt: 'You are helpful',
        simple_editor: false,
        template_name: '',
        response_length: 256,
        restrict_adult_topics: true,
        restrict_language: false,
        enable_web_search: true,
        color: '#E63946',
        icon: 'cpu',
        deleted_at: null,
      });

      expect(response).not.toBeNull();
      expect(response?.name).toBe('Updated Bot');
    });
  });

  describe('fetchBot', () => {
    it('should fetch bot by id', async () => {
      const response = await fetchBot('1');

      expect(response).not.toBeNull();
      expect(response?.name).toBeDefined();
    });
  });

  describe('tryFetchBot', () => {
    const bot = {
      id: 1,
      bot_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Bot 1',
      deleted_at: null,
    };

    it('resolves the bot on success', async () => {
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: bot,
      });

      await expect(tryFetchBot(bot.bot_id)).resolves.toEqual(bot);
    });

    it('passes soft-deleted rows through for the caller to reject', async () => {
      const deleted = { ...bot, deleted_at: '2026-01-01T00:00:00Z' };
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: deleted,
      });

      await expect(tryFetchBot(bot.bot_id)).resolves.toEqual(deleted);
    });

    it("resolves 'missing' on 404 and on foreign-row 403", async () => {
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        data: { detail: 'Not found.' },
      });
      await expect(tryFetchBot('nope')).resolves.toBe('missing');

      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        data: { detail: 'You do not have permission.' },
      });
      await expect(tryFetchBot('foreign')).resolves.toBe('missing');
    });

    it('resolves null on 5xx and transport failure', async () => {
      (apiClient as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: null,
      });
      await expect(tryFetchBot(bot.bot_id)).resolves.toBeNull();

      (apiClient as jest.Mock).mockRejectedValueOnce(
        new Error('Network request failed')
      );
      await expect(tryFetchBot(bot.bot_id)).resolves.toBeNull();
    });

    it('rethrows auth errors so expired sessions reach login', async () => {
      (apiClient as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), {
          name: 'UnauthorizedError',
        })
      );

      await expect(tryFetchBot(bot.bot_id)).rejects.toMatchObject({
        name: 'UnauthorizedError',
      });
    });
  });
});