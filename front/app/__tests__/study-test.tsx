import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import Study from '../flashcards/study';
import { fetchStudyQueue, reviewFlashcard } from '@/api/flashcards';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/flashcards', () => ({
  fetchStudyQueue: jest.fn(),
  reviewFlashcard: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

const card = (id: string, front: string, back: string) => ({
  id: 1,
  flashcard_id: id,
  deck: 1,
  front,
  back,
  order: 0,
  due_at: '2026-08-25T10:00:00Z',
  interval_days: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
  last_reviewed_at: null,
  created_at: '2026-08-25T10:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
});

describe('Study', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ deckId: 'deck-1' });
    (fetchStudyQueue as jest.Mock).mockResolvedValue([
      card('c1', 'Q1', 'A1'),
      card('c2', 'Q2', 'A2'),
    ]);
    (reviewFlashcard as jest.Mock).mockImplementation(
      async (_deckId: string, flashcardId: string, _rating: string) => ({
        ...card(flashcardId, 'Q', 'A'),
        due_at: '2026-08-26T10:00:00Z',
      })
    );
  });

  it('renders the first card with progress', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    expect(screen.getByText('0 / 2')).toBeTruthy();
  });

  it('advances to the next card after flip + rating', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-good'));

    await waitFor(() => expect(screen.getByText('Q2')).toBeTruthy());
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('completes the deck on the last card', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-good'));
    await waitFor(() => expect(screen.getByText('Q2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-good'));

    await waitFor(() =>
      expect(screen.getByTestId('study-session-complete')).toBeTruthy()
    );
    expect(screen.getByText('You reviewed 2 cards.')).toBeTruthy();
  });

  it('shows the empty state when there are no cards', async () => {
    (fetchStudyQueue as jest.Mock).mockResolvedValue([]);
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Nothing due 🎉')).toBeTruthy());
  });
});
