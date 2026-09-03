import {
  fetchDecks,
  fetchFlashcards,
  createDeck,
  fetchDeck,
  deleteDeck,
  fetchStudyQueue,
  reviewFlashcard,
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
            profile: options.body ? JSON.parse(options.body).profile : '550e8400-e29b-41d4-a716-446655440000',
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
      if (method === 'DELETE') {
        return Promise.resolve({ ok: true });
      }
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

    if (url.includes('/study_queue')) {
      return Promise.resolve({
        ok: true,
        data: [
          {
            id: 10,
            flashcard_id: '660e8400-e29b-41d4-a716-446655440010',
            deck: '550e8400-e29b-41d4-a716-446655440001',
            front: 'What is anaphase?',
            back: 'Sister chromatids separate',
            order: 0,
            due_at: '2024-01-01T00:00:00Z',
            interval_days: 0,
            ease: 2.5,
            reps: 0,
            lapses: 0,
            last_reviewed_at: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 11,
            flashcard_id: '660e8400-e29b-41d4-a716-446655440011',
            deck: '550e8400-e29b-41d4-a716-446655440001',
            front: 'Define osmosis',
            back: 'Water diffusion across a membrane',
            order: 1,
            due_at: '2024-01-02T00:00:00Z',
            interval_days: 1,
            ease: 2.35,
            reps: 1,
            lapses: 0,
            last_reviewed_at: '2024-01-01T12:00:00Z',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        ],
      });
    }

    if (url.match(/\/decks\/[^/]+\/flashcards\/[^/]+\/review/)) {
      if (method === 'POST') {
        const body = options.body ? JSON.parse(options.body) : {};
        const intervals: Record<string, number> = { again: 0.1667, hard: 1, good: 1, easy: 1.3 };
        return Promise.resolve({
          ok: true,
          data: {
            id: 10,
            flashcard_id: url.match(
              /\/decks\/[^/]+\/flashcards\/([^/]+)\/review/
            )?.[1],
            deck: '550e8400-e29b-41d4-a716-446655440001',
            front: 'What is anaphase?',
            back: 'Sister chromatids separate',
            order: 0,
            due_at: '2024-01-04T00:00:00Z',
            interval_days: intervals[body.rating as string] ?? 0,
            ease: body.rating === 'again' ? 2.3 : body.rating === 'easy' ? 2.65 : 2.5,
            reps: body.rating === 'again' || body.rating === 'hard' ? 0 : 1,
            lapses: body.rating === 'again' ? 1 : 0,
            last_reviewed_at: '2024-01-03T09:00:00Z',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-03T09:00:00Z',
          },
        });
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

  describe('fetchStudyQueue', () => {
    it('should default to due mode', async () => {
      const queue = await fetchStudyQueue(testDeckId);

      expect(Array.isArray(queue)).toBe(true);
      expect(queue.length).toBe(2);
      expect(queue[0].front).toBe('What is anaphase?');
    });

    it('should return cards with scheduling fields', async () => {
      const queue = await fetchStudyQueue(testDeckId, 'all');

      expect(queue[0]).toHaveProperty('due_at');
      expect(queue[0]).toHaveProperty('interval_days');
      expect(queue[0]).toHaveProperty('ease');
      expect(queue[0]).toHaveProperty('reps');
      expect(queue[0]).toHaveProperty('lapses');
      expect(queue[0]).toHaveProperty('last_reviewed_at');
      expect(queue[0].reps).toBe(0);
      expect(queue[1].reps).toBe(1);
    });
  });

  describe('reviewFlashcard', () => {
    it('should post a rating and return the rescheduled card', async () => {
      const cardId = '660e8400-e29b-41d4-a716-446655440010';
      const updated = await reviewFlashcard(testDeckId, cardId, 'good');

      expect(updated).not.toBeNull();
      expect(updated?.flashcard_id).toBe(cardId);
      expect(updated?.interval_days).toBe(1);
      expect(updated?.reps).toBe(1);
      expect(updated?.due_at).toBeDefined();
      expect(updated?.last_reviewed_at).toBeDefined();
    });

    it('should record a lapse for again ratings', async () => {
      const updated = await reviewFlashcard(
        testDeckId,
        '660e8400-e29b-41d4-a716-446655440010',
        'again'
      );

      expect(updated?.lapses).toBe(1);
      expect(updated?.reps).toBe(0);
    });
  });
});