import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ChatList from '../chatList';
import { fetchChats } from '@/api/chats';
import { setSelectedProfile } from '@/hooks/useSelectedProfile';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    // Mimic focus-on-mount: run the effect after render, not during it.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/chats', () => ({
  fetchChats: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  getSessionMode: jest.fn(() =>
    Promise.resolve({ isTeenDelegated: false, activeProfileId: null })
  ),
}));

const chatFor = (profileId: string, title: string) => ({
  id: 1,
  chat_id: `chat-${profileId}`,
  title,
  modified_at: new Date().toISOString(),
  messages: [],
  profile: { profile_id: profileId },
  bot: { bot_id: 'bot-1', name: 'Fred', color: '#FF5D8F', icon: 'star' },
});

describe('ChatList', () => {
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
    (fetchChats as jest.Mock).mockImplementation((profileId: string) =>
      Promise.resolve({
        results: [chatFor(profileId, `Chat of ${profileId}`)],
        count: 1,
        next: null,
      })
    );
  });

  it('renders the chosen bot icon, not a name initial (Fred regression)', async () => {
    render(<ChatList />);

    await waitFor(() =>
      expect(fetchChats).toHaveBeenCalledWith('kid-1', 1)
    );

    // IconSymbol is mocked to a host string (jest.setup.js).
    const avatar = screen
      .UNSAFE_getAllByType('IconSymbol' as never)
      .find((node) => node.props.name === 'star');
    expect(avatar?.props.color).toBe('#fff');
    // The old avatar rendered the first letter of the bot name.
    expect(screen.queryByText('F')).toBeNull();
  });

  it('refetches chats when the profile is switched in the header', async () => {
    render(<ChatList />);

    await waitFor(() =>
      expect(screen.getByText('Chat of kid-1')).toBeTruthy()
    );

    await act(async () => {
      await setSelectedProfile({ profile_id: 'kid-2', name: 'Leo' });
    });

    await waitFor(() =>
      expect(fetchChats).toHaveBeenCalledWith('kid-2', 1)
    );
    await waitFor(() =>
      expect(screen.getByText('Chat of kid-2')).toBeTruthy()
    );
    expect(screen.queryByText('Chat of kid-1')).toBeNull();
  });
});
