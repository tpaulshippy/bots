import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';

import DeckDetail from '../flashcards/deck';
import { fetchDeck } from '@/api/flashcards';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useLocalSearchParams: jest.fn(() => ({})),
    useNavigation: jest.fn(),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/flashcards', () => ({
  fetchDeck: jest.fn(),
  updateDeck: jest.fn(),
  deleteDeck: jest.fn(),
  createFlashcard: jest.fn(),
  deleteFlashcard: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockSetOptions = jest.fn();

const card = (id: string, front: string, back: string) => ({
  id: 1,
  flashcard_id: id,
  deck: 1,
  front,
  back,
  order: 0,
  created_at: '2026-08-25T10:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
});

const deck = (flashcards: ReturnType<typeof card>[]) => ({
  id: 1,
  deck_id: 'deck-1',
  profile: 1,
  chat: null,
  name: 'Spanish',
  description: 'Basics',
  flashcards,
  card_count: flashcards.length,
  created_at: '2026-08-25T10:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
});

describe('DeckDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ deckId: 'deck-1' });
    (useNavigation as jest.Mock).mockReturnValue({
      isFocused: () => true,
      setOptions: mockSetOptions,
    });
    (fetchDeck as jest.Mock).mockResolvedValue(
      deck([card('c1', 'Hola', 'Hello'), card('c2', 'Adios', 'Goodbye')])
    );
  });

  it('renders the deck description, cards, and study button', async () => {
    render(<DeckDetail />);

    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());
    expect(screen.getByText('Goodbye')).toBeTruthy();
    expect(screen.getByText('Basics')).toBeTruthy();
    expect(screen.getByText('Study')).toBeTruthy();
  });

  it('shows the empty state when the deck has no cards', async () => {
    (fetchDeck as jest.Mock).mockResolvedValue(deck([]));
    render(<DeckDetail />);

    await waitFor(() => expect(screen.getByText('No cards yet')).toBeTruthy());
    expect(screen.getByText('Tap + to add your first card')).toBeTruthy();
  });

  it('navigates to the study screen', async () => {
    render(<DeckDetail />);

    await waitFor(() => expect(screen.getByText('Study')).toBeTruthy());
    fireEvent.press(screen.getByText('Study'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards/study',
      params: { deckId: 'deck-1', title: 'Spanish', mode: 'due' },
    });
  });

  it('opens the card editor when a card is tapped', async () => {
    render(<DeckDetail />);

    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());
    fireEvent.press(screen.getByText('Hola'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards/cardEdit',
      params: {
        deckId: 'deck-1',
        flashcardId: 'c1',
        front: 'Hola',
        back: 'Hello',
      },
    });
  });
});
