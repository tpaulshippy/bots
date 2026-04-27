import { fetchBots, fetchBot, upsertBot } from '../../api/bots';

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
        template_name: null,
        response_length: 256,
        restrict_adult_topics: true,
        restrict_language: false,
        enable_web_search: true,
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
        template_name: null,
        response_length: 256,
        restrict_adult_topics: true,
        restrict_language: false,
        enable_web_search: true,
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
});