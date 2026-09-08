import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

import ChildChat from '../chat';
import { fetchBots } from '@/api/bots';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

// Keep the real SelectBot (bot picker) but stub the heavy chat surface.
jest.mock('../botChat', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(Text, { testID: 'chat-screen' }, 'Chat'),
  };
});

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

const bot = {
  id: 1,
  bot_id: 'bot-1',
  name: 'Fred',
  color: '#FF5D8F',
  icon: 'star',
};

describe('ChildChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (fetchBots as jest.Mock).mockResolvedValue({ results: [bot], count: 1 });
  });

  it('shows the bot picker when no chat is selected', async () => {
    render(<ChildChat />);

    await waitFor(() => expect(screen.getByText('Select bot')).toBeTruthy());
    expect(screen.queryByTestId('chat-screen')).toBeNull();
  });

  it('shows the chat when a chatId param is present', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ chatId: 'chat-1' });
    render(<ChildChat />);

    await waitFor(() => expect(screen.getByTestId('chat-screen')).toBeTruthy());
    expect(screen.queryByText('Select bot')).toBeNull();
  });

  it('auto-selects the stored bot straight into chat', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'selectedBot' ? JSON.stringify(bot) : null)
    );
    render(<ChildChat />);

    await waitFor(() => expect(screen.getByTestId('chat-screen')).toBeTruthy());
  });

  it('stays on the picker for a fresh newChat even with a stored bot', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ newChat: '1' });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'selectedBot' ? JSON.stringify(bot) : null)
    );
    render(<ChildChat />);

    await waitFor(() => expect(screen.getByText('Select bot')).toBeTruthy());
    expect(screen.queryByTestId('chat-screen')).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot');
  });
});
