import { fetchAiModels } from '../../api/aiModels';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url, options = {}) => {
    if (url.includes('/ai_models.json')) {
      return Promise.resolve({
        ok: true,
        data: {
          count: 2,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              model_id: 'test-model-1',
              name: 'Test Model 1',
              input_token_cost: 0.0001,
              output_token_cost: 0.0002,
              is_default: true,
              created_at: '2024-01-01T00:00:00Z',
              modified_at: '2024-01-01T00:00:00Z',
              url: '/api/ai_models/1/',
            },
            {
              id: 2,
              model_id: 'test-model-2',
              name: 'Test Model 2',
              input_token_cost: 0.0002,
              output_token_cost: 0.0004,
              is_default: false,
              created_at: '2024-01-02T00:00:00Z',
              modified_at: '2024-01-02T00:00:00Z',
              url: '/api/ai_models/2/',
            },
          ],
        },
      });
    }
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('AI Models API', () => {
  describe('fetchAiModels', () => {
    it('should return paginated response with results and count', async () => {
      const response = await fetchAiModels();

      expect(response).not.toBeNull();
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('count');
      expect(Array.isArray(response?.results)).toBe(true);
    });

    it('should include required fields in ai model items', async () => {
      const response = await fetchAiModels();

      if (response && response.results && response.results.length > 0) {
        const model = response.results[0];
        expect(model).toHaveProperty('model_id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('input_token_cost');
        expect(model).toHaveProperty('output_token_cost');
        expect(model).toHaveProperty('is_default');
      }
    });
  });
});