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
    expect(screen.getByTestId('study-correct-rate')).toHaveTextContent(
      '100% correct (2 of 2).'
    );
  });

  it('reports the correct rate excluding Again ratings', async () => {
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-again'));
    await waitFor(() => expect(screen.getByText('Q2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-good'));

    await waitFor(() =>
      expect(screen.getByTestId('study-session-complete')).toBeTruthy()
    );
    expect(screen.getByTestId('study-correct-rate')).toHaveTextContent(
      '50% correct (1 of 2).'
    );
  });

  it('shows the empty state when there are no cards', async () => {
    (fetchStudyQueue as jest.Mock).mockResolvedValue([]);
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Nothing due 🎉')).toBeTruthy());
  });

  it('shows an error with retry when the queue fails to load', async () => {
    (fetchStudyQueue as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<Study />);

    await waitFor(() => expect(screen.getByTestId('study-load-error')).toBeTruthy());
    // A failed load must not render as an empty queue.
    expect(screen.queryByText('Nothing due 🎉')).toBeNull();

    fireEvent.press(screen.getByTestId('study-load-retry'));
    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
  });

  it('stays on the same card when saving the review fails', async () => {
    (reviewFlashcard as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<Study />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('study-card'));
    fireEvent.press(screen.getByTestId('study-rating-good'));

    await waitFor(() => expect(reviewFlashcard).toHaveBeenCalled());
    // The failed review is not counted: progress unchanged, still flipped
    // on the first card (answer visible), session not complete.
    expect(screen.getByText('0 / 2')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.queryByTestId('study-session-complete')).toBeNull();
  });
});
