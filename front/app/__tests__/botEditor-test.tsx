import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import BotEditor from '../parent/botEditor';
import { fetchBot, upsertBot } from '@/api/bots';
import type { Bot } from '@/api/bots';
import { fetchAiModels } from '@/api/aiModels';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useLocalSearchParams: jest.fn(() => ({})),
    useNavigation: jest.fn(),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/bots', () => ({
  fetchBot: jest.fn(),
  upsertBot: jest.fn(),
}));

jest.mock('@/api/aiModels', () => ({
  fetchAiModels: jest.fn(),
}));

const mockAlert = jest.fn();
jest.mock('@/components/Alert', () => (title: string, message: string, options: unknown[]) =>
  mockAlert(title, message, options)
);

jest.mock('@react-native-picker/picker', () => {
  const MockPicker = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    { Item: () => null }
  );
  return { Picker: MockPicker };
});

const existingBot: Bot = {
  id: 1,
  bot_id: 'bot-1',
  name: 'Freddy',
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
};

const models = [
  {
    id: 1,
    model_id: 'model-1',
    name: 'Spark',
    input_token_cost: 1,
    output_token_cost: 2,
    is_default: true,
  },
  {
    id: 2,
    model_id: 'model-2',
    name: 'Ember',
    input_token_cost: 1,
    output_token_cost: 2,
    is_default: false,
  },
];

describe('BotEditor', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  let headerRight: (() => React.ReactElement) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    headerRight = undefined;
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: (opts: { headerRight?: () => React.ReactElement }) => {
        headerRight = opts.headerRight;
      },
    });
    (fetchAiModels as jest.Mock).mockResolvedValue({
      results: models,
      count: models.length,
    });
  });

  it('renders nothing while the bot is loading', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ botId: 'bot-1' });
    (fetchBot as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { toJSON } = render(<BotEditor />);

    expect(toJSON()).toBeNull();
  });

  it('loads an existing bot into the advanced editor', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ botId: 'bot-1' });
    (fetchBot as jest.Mock).mockResolvedValue(existingBot);

    render(<BotEditor />);

    await waitFor(() => expect(screen.getByText('System Prompt')).toBeTruthy());
    expect(fetchBot).toHaveBeenCalledWith('bot-1');
    expect(screen.getByDisplayValue('Freddy')).toBeTruthy();
    expect(screen.getByText('Delete Bot')).toBeTruthy();
  });

  it('builds a new bot with the default model when no id is given', async () => {
    (fetchBot as jest.Mock).mockResolvedValue(null);

    render(<BotEditor />);

    await waitFor(() =>
      expect(screen.getByText('Select a Template')).toBeTruthy()
    );
    expect(fetchAiModels).toHaveBeenCalled();
    expect(fetchBot).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('200')).toBeTruthy();
  });

  it('switching from simple to advanced replaces the route', async () => {
    (fetchBot as jest.Mock).mockResolvedValue(null);
    (upsertBot as jest.Mock).mockResolvedValue({
      ...existingBot,
      id: 9,
      bot_id: 'new-bot',
      name: 'Freddy',
      simple_editor: false,
    });

    render(<BotEditor />);

    await waitFor(() =>
      expect(screen.getByText('Select a Template')).toBeTruthy()
    );

    const element = headerRight!() as React.ReactElement<{
      onPress?: () => void | Promise<void>;
    }>;
    await act(async () => {
      await element.props.onPress?.();
    });

    expect(upsertBot).toHaveBeenCalledWith(
      expect.objectContaining({ simple_editor: false })
    );
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/parent/botEditor',
      params: { title: 'Freddy', botId: 'new-bot' },
    });
  });
});
