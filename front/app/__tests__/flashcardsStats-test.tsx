import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Flashcards from '../flashcards';
import { fetchDecks } from '@/api/flashcards';
import { fetchStats } from '@/api/stats';
import { setSelectedProfile } from '@/hooks/useSelectedProfile';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/flashcards', () => ({
  fetchDecks: jest.fn(),
  createDeck: jest.fn(),
}));

jest.mock('@/api/stats', () => ({
  fetchStats: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  getSessionMode: jest.fn(() =>
    Promise.resolve({ isTeenDelegated: false, activeProfileId: null })
  ),
}));

const week = [
  { date: '2026-09-02', messages: 0, reviews: 0 },
  { date: '2026-09-03', messages: 2, reviews: 0 },
  { date: '2026-09-04', messages: 0, reviews: 0 },
  { date: '2026-09-05', messages: 1, reviews: 3 },
  { date: '2026-09-06', messages: 0, reviews: 0 },
  { date: '2026-09-07', messages: 4, reviews: 0 },
  { date: '2026-09-08', messages: 1, reviews: 2 },
];

const statsFor = (overrides = {}) => ({
  profile_id: 'kid-1',
  name: 'Maya',
  current_streak: 3,
  longest_streak: 5,
  total_chats: 4,
  total_messages: 21,
  total_reviews: 12,
  chatted_today: true,
  studied_today: true,
  week,
  ...overrides,
});

// Text children arrive fragmented ("🔥", " ", "3-day streak"); join them.
const textOf = (testID: string): string => {
  const children = screen.getByTestId(testID).props.children;
  const flat = (node: unknown): string =>
    Array.isArray(node) ? node.map(flat).join('') : String(node ?? '');
  return flat(children);
};

describe('Flashcards stats card', () => {
  let storedProfile: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    storedProfile = JSON.stringify({ profile_id: 'kid-1', name: 'Maya' });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'selectedProfile' ? storedProfile : null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key === 'selectedProfile') storedProfile = value;
      }
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async () => {
      storedProfile = null;
    });
    (fetchDecks as jest.Mock).mockResolvedValue({ results: [], count: 0 });
    (fetchStats as jest.Mock).mockResolvedValue(statsFor());
  });

  it('renders the streak, totals, and today badge', async () => {
    render(<Flashcards />);

    await waitFor(() =>
      expect(screen.getByTestId('stats-card')).toBeTruthy()
    );
    expect(textOf('stats-streak')).toContain('3-day streak');
    expect(textOf('stats-today-badge')).toContain(
      'Chatted + studied today 🎉'
    );
    expect(textOf('stats-totals')).toContain('12 reviews');
    expect(screen.getByTestId('stats-week')).toBeTruthy();
  });

  it('shows the start prompt when there is no streak yet', async () => {
    (fetchStats as jest.Mock).mockResolvedValue(
      statsFor({
        current_streak: 0,
        longest_streak: 0,
        chatted_today: false,
        studied_today: false,
      })
    );
    render(<Flashcards />);

    await waitFor(() =>
      expect(screen.getByTestId('stats-card')).toBeTruthy()
    );
    expect(textOf('stats-streak')).toContain('No streak yet');
    expect(textOf('stats-today-badge')).toContain(
      'Chat or study today to start one!'
    );
  });

  it('hides the card when stats fail to load', async () => {
    (fetchStats as jest.Mock).mockResolvedValue(null);
    render(<Flashcards />);

    await waitFor(() =>
      expect(screen.getByText('No decks yet')).toBeTruthy()
    );
    expect(screen.queryByTestId('stats-card')).toBeNull();
  });

  it('refetches stats when the profile is switched', async () => {
    render(<Flashcards />);

    await waitFor(() => expect(fetchStats).toHaveBeenCalledWith('kid-1'));

    await act(async () => {
      await setSelectedProfile({ profile_id: 'kid-2', name: 'Leo' });
    });

    await waitFor(() => expect(fetchStats).toHaveBeenCalledWith('kid-2'));
  });
});
