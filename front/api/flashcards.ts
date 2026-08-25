import { request, requestRaw, PaginatedResponse } from "./request";

export interface Flashcard {
  id: number;
  flashcard_id: string;
  deck: number;
  front: string;
  back: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: number;
  deck_id: string;
  profile: number;
  chat: number | null;
  name: string;
  description: string;
  flashcards: Flashcard[];
  card_count: number;
  due_count?: number;
  last_studied_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeckListItem {
  id: number;
  deck_id: string;
  name: string;
  description: string;
  card_count: number;
  created_at: string;
  updated_at: string;
}

export const fetchDecks = async (profileId: string): Promise<PaginatedResponse<DeckListItem>> =>
  request<PaginatedResponse<DeckListItem>>(
    `/decks.json?profileId=${profileId}`,
    { method: "GET" },
    { results: [], count: 0 }
  );

export const fetchDeck = async (deckId: string): Promise<Deck | null> =>
  request<Deck | null>(`/decks/${deckId}.json`, { method: "GET" }, null);

export const createDeck = async (
  name: string,
  description: string,
  profileId: string,
  chatId?: string
): Promise<Deck | null> =>
  request<Deck | null>("/decks.json", {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      profile: profileId,
      chat: chatId || null,
    }),
  }, null);

export const updateDeck = async (
  deckId: string,
  name: string,
  description: string
): Promise<Deck | null> =>
  request<Deck | null>(`/decks/${deckId}.json`, {
    method: "PATCH",
    body: JSON.stringify({
      name,
      description,
    }),
  }, null);

export const deleteDeck = async (deckId: string): Promise<boolean> => {
  const response = await requestRaw<void>(`/decks/${deckId}.json`, {
    method: "DELETE",
  });
  return response?.ok ?? false;
};

export const fetchFlashcards = async (deckId: string): Promise<PaginatedResponse<Flashcard>> =>
  request<PaginatedResponse<Flashcard>>(
    `/decks/${deckId}/flashcards.json`,
    { method: "GET" },
    { results: [], count: 0 }
  );

export const createFlashcard = async (
  deckId: string,
  front: string,
  back: string
): Promise<Flashcard | null> =>
  request<Flashcard | null>(`/decks/${deckId}/flashcards.json`, {
    method: "POST",
    body: JSON.stringify({
      front,
      back,
    }),
  }, null);

export const updateFlashcard = async (
  deckId: string,
  flashcardId: string,
  front: string,
  back: string
): Promise<Flashcard | null> =>
  request<Flashcard | null>(
    `/decks/${deckId}/flashcards/${flashcardId}.json`,
    {
      method: "PATCH",
      body: JSON.stringify({
        front,
        back,
      }),
    },
    null
  );

export const deleteFlashcard = async (
  deckId: string,
  flashcardId: string
): Promise<boolean> => {
  const response = await requestRaw<void>(
    `/decks/${deckId}/flashcards/${flashcardId}.json`,
    {
      method: "DELETE",
    }
  );
  return response?.ok ?? false;
};
