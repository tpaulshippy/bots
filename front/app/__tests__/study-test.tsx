import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import Study from '../flashcards/study';
import { fetchFlashcards } from '@/api/flashcards';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/flashcards', () => ({
  fetchFlashcards: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

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

describe('Study', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ deckId: 'deck-1' });
    (fetchFlashcards as jest.Mock).mockResolvedValue({
      results: [card('c1', 'Q1', 'A1'), card('c2', 'Q2', 'A2')],
      count: 2,
    });
  });

  it('renders the first card with progress', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('advances to the next card', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-next'));

    await waitFor(() => expect(screen.getByText('Q2')).toBeTruthy());
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('completes the deck on the last card and restarts', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-next'));
    await waitFor(() => expect(screen.getByText('Q2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-next'));

    await waitFor(() => expect(screen.getByText('Done! 🎉')).toBeTruthy());
    expect(screen.getByText('You studied all 2 cards.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('study-restart'));
    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('shows the empty state when there are no cards', async () => {
    (fetchFlashcards as jest.Mock).mockResolvedValue({ results: [], count: 0 });
    render(<Study />);

    await waitFor(() => expect(screen.getByText('No cards to study')).toBeTruthy());
  });
});
