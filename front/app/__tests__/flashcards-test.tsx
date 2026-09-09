import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Flashcards from '../flashcards';
import { fetchDecks } from '@/api/flashcards';
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

jest.mock('@/api/tokens', () => ({
  getSessionMode: jest.fn(() =>
    Promise.resolve({ isTeenDelegated: false, activeProfileId: null })
  ),
}));

const deckFor = (profileId: string, name: string) => ({
  id: 1,
  deck_id: `deck-${profileId}`,
  name,
  description: '',
  card_count: 3,
  created_at: '2026-08-25T10:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
});

describe('Flashcards', () => {
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
    (fetchDecks as jest.Mock).mockImplementation((profileId: string) =>
      Promise.resolve({
        results: [deckFor(profileId, `Deck of ${profileId}`)],
        count: 1,
      })
    );
  });

  it('refetches decks when the profile is switched', async () => {
    render(<Flashcards />);

    await waitFor(() =>
      expect(screen.getByText('Deck of kid-1')).toBeTruthy()
    );

    await act(async () => {
      await setSelectedProfile({ profile_id: 'kid-2', name: 'Leo' });
    });

    await waitFor(() =>
      expect(fetchDecks).toHaveBeenCalledWith('kid-2')
    );
    await waitFor(() =>
      expect(screen.getByText('Deck of kid-2')).toBeTruthy()
    );
    expect(screen.queryByText('Deck of kid-1')).toBeNull();
  });

  it('clears decks when the selection is cleared', async () => {
    render(<Flashcards />);

    await waitFor(() =>
      expect(screen.getByText('Deck of kid-1')).toBeTruthy()
    );

    await act(async () => {
      await setSelectedProfile(null);
    });

    await waitFor(() =>
      expect(screen.getByText('No decks yet')).toBeTruthy()
    );
    expect(screen.queryByText('Deck of kid-1')).toBeNull();
  });
});
