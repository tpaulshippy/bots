import {
  fetchDecks,
  fetchFlashcards,
  createDeck,
  fetchDeck,
  deleteDeck,
} from '../../api/flashcards';

// Mock the apiClient to return paginated responses matching OpenAPI schema
jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url, options = {}) => {
    const method = options.method || 'GET';
    
    // Handle different endpoints based on URL
    if (url.includes('/decks.json')) {
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
                deck_id: '550e8400-e29b-41d4-a716-446655440001',
                profile: '550e8400-e29b-41d4-a716-446655440000',
                chat: null,
                name: 'Test Deck 1',
                description: 'Description 1',
                card_count: 3,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              },
              {
                id: 2,
                deck_id: '550e8400-e29b-41d4-a716-446655440002',
                profile: '550e8400-e29b-41d4-a716-446655440000',
                chat: null,
                name: 'Test Deck 2',
                description: 'Description 2',
                card_count: 5,
                created_at: '2024-01-02T00:00:00Z',
                updated_at: '2024-01-02T00:00:00Z',
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
            deck_id: '550e8400-e29b-41d4-a716-446655440003',
            profile: '550e8400-e29b-41d4-a716-446655440000',
            chat: options.body ? JSON.parse(options.body).chat : null,
            name: 'New Deck',
            description: 'New description',
            flashcards: [],
            card_count: 0,
            created_at: '2024-01-03T00:00:00Z',
            updated_at: '2024-01-03T00:00:00Z',
          },
        });
      }
    }
    
    if (url.match(/\/decks\/[^/]+\.json$/)) {
      return Promise.resolve({
        ok: true,
        data: {
          id: 1,
          deck_id: '550e8400-e29b-41d4-a716-446655440001',
          profile: '550e8400-e29b-41d4-a716-446655440000',
          chat: null,
          name: 'Test Deck 1',
          description: 'Description 1',
          flashcards: [],
          card_count: 3,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      });
    }
    
    if (url.match(/\/decks\/[^/]+\/flashcards\.json/)) {
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
                flashcard_id: '550e8400-e29b-41d4-a716-446655440001',
                deck: '550e8400-e29b-41d4-a716-446655440001',
                front: 'Front 1',
                back: 'Back 1',
                order: 0,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
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
            flashcard_id: '550e8400-e29b-41d4-a716-446655440003',
            deck: '550e8400-e29b-41d4-a716-446655440001',
            front: 'New Front',
            back: 'New Back',
            order: 1,
            created_at: '2024-01-03T00:00:00Z',
            updated_at: '2024-01-03T00:00:00Z',
          },
        });
      }
    }
    
    if (url.match(/\/decks\/[^/]+\/flashcards\/[^/]+\.json$/)) {
      if (method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
    }
    
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('Flashcards API', () => {
  const testProfileId = '550e8400-e29b-41d4-a716-446655440000';
  const testDeckId = '550e8400-e29b-41d4-a716-446655440001';

  describe('fetchDecks', () => {
    it('should return paginated response with results and count', async () => {
      const response = await fetchDecks(testProfileId);

      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('count');
      expect(Array.isArray(response.results)).toBe(true);
    });

    it('should handle response with results', async () => {
      const response = await fetchDecks(testProfileId);

      expect(response.results).toBeDefined();
      expect(response.count).toBe(2);
    });

    it('should include card_count in deck items', async () => {
      const response = await fetchDecks(testProfileId);

      if (response.results.length > 0) {
        expect(response.results[0]).toHaveProperty('card_count');
      }
    });

    it('should include profile field in deck items', async () => {
      const response = await fetchDecks(testProfileId);

      if (response.results.length > 0) {
        expect(response.results[0]).toHaveProperty('profile');
      }
    });
  });

  describe('fetchFlashcards', () => {
    it('should return paginated response with results and count', async () => {
      const response = await fetchFlashcards(testDeckId);

      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('count');
      expect(Array.isArray(response.results)).toBe(true);
    });

    it('should handle response with results', async () => {
      const response = await fetchFlashcards(testDeckId);

      expect(response.results).toBeDefined();
      expect(response.count).toBe(2);
    });
  });

  describe('createDeck', () => {
    it('should create deck with profile field', async () => {
      const response = await createDeck(
        'New Deck',
        'Test description',
        testProfileId
      );

      expect(response).not.toBeNull();
      expect(response?.name).toBe('New Deck');
      expect(response?.profile).toBe(testProfileId);
    });

    it('should create deck with optional chat field', async () => {
      const chatId = '550e8400-e29b-41d4-a716-446655440099';
      const response = await createDeck(
        'New Deck',
        'Test description',
        testProfileId,
        chatId
      );

      expect(response).not.toBeNull();
      expect(response?.chat).toBe(chatId);
    });
  });

  describe('fetchDeck', () => {
    it('should fetch deck by UUID', async () => {
      const response = await fetchDeck(testDeckId);

      expect(response).not.toBeNull();
      expect(response?.name).toBeDefined();
    });

    it('should include profile and chat fields in deck detail', async () => {
      const response = await fetchDeck(testDeckId);

      expect(response).not.toBeNull();
      expect(response).toHaveProperty('profile');
      expect(response).toHaveProperty('chat');
      expect(response).toHaveProperty('flashcards');
    });
  });

  describe('deleteDeck', () => {
    it('should delete deck successfully', async () => {
      const response = await deleteDeck(testDeckId);

      expect(response).toBe(true);
    });
  });
});