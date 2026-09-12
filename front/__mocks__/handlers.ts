import { http, HttpResponse, delay } from 'msw';

export const handlers = [
  // Deck endpoints - these had pagination and field mismatch issues
  http.get('/api/decks.json', async ({ request }) => {
    await delay(200);
    return HttpResponse.json({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  }),

  http.post('/api/decks.json', async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      id: 1,
      deck_id: '550e8400-e29b-41d4-a716-446655440000',
      profile: body.profile || '550e8400-e29b-41d4-a716-446655440000',
      chat: body.chat || null,
      name: body.name || '',
      description: body.description || '',
      flashcards: [],
      card_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.get('/api/decks/:id.json', async ({ params }) => {
    await delay(200);
    const id = params.id as string;
    return HttpResponse.json({
      id: typeof id === 'string' && !id.match(/^\d+$/) ? 1 : parseInt(String(id), 10),
      deck_id: id,
      profile: '550e8400-e29b-41d4-a716-446655440000',
      chat: null,
      name: 'Test Deck',
      description: 'Test Description',
      flashcards: [],
      card_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.patch('/api/decks/:id.json', async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      id: 1,
      deck_id: '550e8400-e29b-41d4-a716-446655440000',
      profile: '550e8400-e29b-41d4-a716-446655440000',
      chat: null,
      name: body.name || 'Updated Deck',
      description: body.description || '',
      flashcards: [],
      card_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.delete('/api/decks/:id.json', async () => {
    await delay(200);
    return HttpResponse.json({}, { status: 204 });
  }),

  // Flashcard endpoints - these also had pagination issues
  http.get('/api/decks/:deck_pk/flashcards.json', async ({ params }) => {
    await delay(200);
    return HttpResponse.json({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  }),

  http.post('/api/decks/:deck_pk/flashcards.json', async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      id: 1,
      flashcard_id: '550e8400-e29b-41d4-a716-446655440001',
      deck: '550e8400-e29b-41d4-a716-446655440000',
      front: body.front || '',
      back: body.back || '',
      order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.get('/api/decks/:deck_pk/flashcards/:id.json', async ({ params }) => {
    await delay(200);
    const id = params.id as string;
    return HttpResponse.json({
      id: typeof id === 'string' && !id.match(/^\d+$/) ? 1 : parseInt(String(id), 10),
      flashcard_id: id,
      deck: '550e8400-e29b-41d4-a716-446655440000',
      front: 'Front text',
      back: 'Back text',
      order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.patch('/api/decks/:deck_pk/flashcards/:id.json', async ({ request }) => {
    await delay(200);
    const body = (await request.json()) as Record<string, any>;
    return HttpResponse.json({
      id: 1,
      flashcard_id: '550e8400-e29b-41d4-a716-446655440001',
      deck: '550e8400-e29b-41d4-a716-446655440000',
      front: body.front || 'Updated Front',
      back: body.back || 'Updated Back',
      order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.delete('/api/decks/:deck_pk/flashcards/:id.json', async () => {
    await delay(200);
    return HttpResponse.json({}, { status: 204 });
  }),

  // Spaced repetition study queue + review
  http.get('/api/decks/:deck_pk/study_queue.json', async () => {
    await delay(200);
    return HttpResponse.json([
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
    ]);
  }),

  http.post('/api/decks/:deck_pk/flashcards/:id/review.json', async ({ request, params }) => {
    await delay(200);
    const body = (await request.json()) as Record<string, any>;
    const id = params.id as string;
    return HttpResponse.json({
      id: 10,
      flashcard_id: id,
      deck: '550e8400-e29b-41d4-a716-446655440001',
      front: 'What is anaphase?',
      back: 'Sister chromatids separate',
      order: 0,
      due_at: '2024-01-04T00:00:00Z',
      interval_days: body.rating === 'again' ? 0.1667 : 1,
      ease: 2.5,
      reps: body.rating === 'again' ? 0 : 1,
      lapses: body.rating === 'again' ? 1 : 0,
      last_reviewed_at: '2024-01-03T09:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-03T09:00:00Z',
    });
  }),

  // Profile endpoints
  http.get('/api/profiles.json', async () => {
    await delay(200);
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1,
        profile_id: '550e8400-e29b-41d4-a716-446655440000',
        user: 1,
        name: 'Test User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });
  }),

  // Bots endpoints
  http.get('/api/bots.json', async () => {
    await delay(200);
    return HttpResponse.json({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  }),

  // Chats endpoints
  http.get('/api/chats.json', async () => {
    await delay(200);
    return HttpResponse.json({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  }),
];