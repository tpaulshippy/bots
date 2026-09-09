import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SelectBot from '../selectBot';
import { fetchBots } from '@/api/bots';
import type { Bot } from '@/api/bots';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useNavigation: jest.fn(),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const makeBot = (overrides: Partial<Bot>): Bot => ({
  id: 1,
  bot_id: 'bot-1',
  name: 'Math Buddy',
  ai_model: 'model-1',
  system_prompt: 'Be nice',
  simple_editor: false,
  template_name: null,
  response_length: 200,
  restrict_language: true,
  restrict_adult_topics: true,
  enable_web_search: false,
  color: null,
  icon: null,
  deleted_at: null,
  ...overrides,
});

const bots = [
  makeBot({ id: 1, bot_id: 'bot-1', name: 'Math Buddy' }),
  makeBot({ id: 2, bot_id: 'bot-2', name: 'Science Sam' }),
];

describe('SelectBot', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (fetchBots as jest.Mock).mockResolvedValue({
      results: bots,
      count: bots.length,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('shows an empty state with a CTA that opens the bot editor', async () => {
    (fetchBots as jest.Mock).mockResolvedValue({ results: [], count: 0 });

    render(<SelectBot />);

    await waitFor(() => expect(screen.getByText('No bots yet')).toBeTruthy());

    fireEvent.press(screen.getByTestId('create-first-tutor'));
    expect(mockRouter.push).toHaveBeenCalledWith('/parent/botEditor');
  });

  it('renders the available bots', async () => {
    render(<SelectBot />);

    await waitFor(() => expect(screen.getByText('Math Buddy')).toBeTruthy());
    expect(screen.getByText('Science Sam')).toBeTruthy();
    expect(screen.getByText('Who do you want to learn with today?')).toBeTruthy();
  });

  it('selecting a bot persists it and deselecting removes it', async () => {
    const setBotSelected = jest.fn();
    render(<SelectBot setBotSelected={setBotSelected} />);

    await waitFor(() => expect(screen.getByText('Math Buddy')).toBeTruthy());

    fireEvent.press(screen.getByText('Math Buddy'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedBot',
        JSON.stringify(bots[0])
      )
    );
    expect(setBotSelected).toHaveBeenCalledWith(true);

    fireEvent.press(screen.getByText('Math Buddy'));

    await waitFor(() =>
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot')
    );
  });

  it('skipAutoSelect clears stored selection without selecting', async () => {
    const setBotSelected = jest.fn();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify(bots[1])
    );

    render(<SelectBot setBotSelected={setBotSelected} skipAutoSelect />);

    await waitFor(() =>
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot')
    );
    expect(setBotSelected).not.toHaveBeenCalled();
  });
});
