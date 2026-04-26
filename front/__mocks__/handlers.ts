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
    const body = await request.json();
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

  http.get('/api/decks/:id/', async ({ params }) => {
    await delay(200);
    const id = params.id;
    return HttpResponse.json({
      id: typeof id === 'string' && !id.match(/^\d+$/) ? 1 : parseInt(id, 10),
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

  http.patch('/api/decks/:id/', async ({ request }) => {
    await delay(200);
    const body = await request.json();
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

  http.delete('/api/decks/:id/', async () => {
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
    const body = await request.json();
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

  http.get('/api/decks/:deck_pk/flashcards/:id/', async ({ params }) => {
    await delay(200);
    const id = params.id;
    return HttpResponse.json({
      id: typeof id === 'string' && !id.match(/^\d+$/) ? 1 : parseInt(id, 10),
      flashcard_id: id,
      deck: '550e8400-e29b-41d4-a716-446655440000',
      front: 'Front text',
      back: 'Back text',
      order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }),

  http.patch('/api/decks/:deck_pk/flashcards/:id/', async ({ request }) => {
    await delay(200);
    const body = await request.json();
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

  http.delete('/api/decks/:deck_pk/flashcards/:id/', async () => {
    await delay(200);
    return HttpResponse.json({}, { status: 204 });
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