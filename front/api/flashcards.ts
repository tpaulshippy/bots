import { apiClient } from "./apiClient";

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

export const fetchDecks = async (profileId: string): Promise<DeckListItem[]> => {
  const response = await apiClient<DeckListItem[]>(
    `/decks.json?profileId=${profileId}`,
    { method: "GET" }
  );
  if (!response.ok || !response.data) {
    return [];
  }
  return response.data;
};

export const fetchDeck = async (deckId: string): Promise<Deck | null> => {
  const response = await apiClient<Deck>(`/decks/${deckId}.json`, { method: "GET" });
  if (!response.ok || !response.data) {
    return null;
  }
  return response.data;
};

export const createDeck = async (
  name: string,
  description: string,
  profileId: string,
  chatId?: string
): Promise<Deck | null> => {
  const response = await apiClient<Deck>("/decks.json", {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      profile: profileId,
      chat: chatId || null,
    }),
  });
  if (!response.ok || !response.data) {
    return null;
  }
  return response.data;
};

export const updateDeck = async (
  deckId: string,
  name: string,
  description: string
): Promise<Deck | null> => {
  const response = await apiClient<Deck>(`/decks/${deckId}.json`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      description,
    }),
  });
  if (!response.ok || !response.data) {
    return null;
  }
  return response.data;
};

export const deleteDeck = async (deckId: string): Promise<boolean> => {
  const response = await apiClient<void>(`/decks/${deckId}.json`, {
    method: "DELETE",
  });
  return response.ok;
};

export const fetchFlashcards = async (deckId: string): Promise<Flashcard[]> => {
  const response = await apiClient<Flashcard[]>(`/decks/${deckId}/flashcards.json`, {
    method: "GET",
  });
  if (!response.ok || !response.data) {
    return [];
  }
  return response.data;
};

export const createFlashcard = async (
  deckId: string,
  front: string,
  back: string
): Promise<Flashcard | null> => {
  const response = await apiClient<Flashcard>(`/decks/${deckId}/flashcards.json`, {
    method: "POST",
    body: JSON.stringify({
      front,
      back,
    }),
  });
  if (!response.ok || !response.data) {
    return null;
  }
  return response.data;
};

export const updateFlashcard = async (
  deckId: string,
  flashcardId: string,
  front: string,
  back: string
): Promise<Flashcard | null> => {
  const response = await apiClient<Flashcard>(
    `/decks/${deckId}/flashcards/${flashcardId}.json`,
    {
      method: "PUT",
      body: JSON.stringify({
        front,
        back,
      }),
    }
  );
  if (!response.ok || !response.data) {
    return null;
  }
  return response.data;
};

export const deleteFlashcard = async (
  deckId: string,
  flashcardId: string
): Promise<boolean> => {
  const response = await apiClient<void>(
    `/decks/${deckId}/flashcards/${flashcardId}.json`,
    {
      method: "DELETE",
    }
  );
  return response.ok;
};