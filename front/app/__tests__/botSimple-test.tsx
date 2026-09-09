import React from 'react';
import { TextInput } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { useNavigation } from 'expo-router';

import SimpleBotEditor from '../parent/botSimple';
import { upsertBot } from '@/api/bots';
import type { Bot } from '@/api/bots';
import * as Sentry from '@sentry/react-native';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useNavigation: jest.fn(),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/bots', () => ({
  upsertBot: jest.fn(),
}));

const baseBot: Bot = {
  id: 1,
  bot_id: 'bot-1',
  name: 'Freddy',
  ai_model: 'model-1',
  system_prompt: '',
  simple_editor: true,
  template_name: 'Blank',
  response_length: 200,
  restrict_language: true,
  restrict_adult_topics: true,
  enable_web_search: false,
  color: null,
  icon: null,
  deleted_at: null,
};

describe('SimpleBotEditor', () => {
  const onSwitchEditor = jest.fn();
  let headerRight: (() => React.ReactElement) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    headerRight = undefined;
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: (opts: { headerRight?: () => React.ReactElement }) => {
        headerRight = opts.headerRight;
      },
    });
    (upsertBot as jest.Mock).mockResolvedValue({ ...baseBot, bot_id: 'bot-9' });
  });

  // The save control lives in the navigation header; grab its onPress from
  // the rendered element instead of mounting a second tree.
  const pressSave = async () => {
    const element = headerRight!() as React.ReactElement<{
      onPress?: () => void | Promise<void>;
    }>;
    await act(async () => {
      await element.props.onPress?.();
    });
  };

  it('renders the template list, template inputs, and safety toggles', () => {
    render(<SimpleBotEditor botEditing={baseBot} onSwitchEditor={onSwitchEditor} />);

    expect(screen.getByText('Select a Template')).toBeTruthy();
    expect(screen.getByText('Blank')).toBeTruthy();
    expect(screen.getByText('Character')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('The name of the bot')).toBeTruthy();
    expect(screen.getByText('Response Length (words)')).toBeTruthy();
    expect(screen.getByText('Restrict Foul Language')).toBeTruthy();
    expect(screen.getByText('Restrict Adult Topics')).toBeTruthy();
    expect(screen.getByText('Enable Web Search')).toBeTruthy();
    expect(screen.getByTestId('baseline-safety-note')).toBeTruthy();
  });

  it('switching templates shows that template inputs', () => {
    render(<SimpleBotEditor botEditing={baseBot} onSwitchEditor={onSwitchEditor} />);

    expect(screen.queryByText('Story')).toBeNull();

    fireEvent.press(screen.getByText('Character'));

    expect(screen.getByText('Story')).toBeTruthy();
    expect(
      screen.getByText('The book, show, or movie the character is from')
    ).toBeTruthy();
  });

  it('saves a generated system prompt and notifies the parent', async () => {
    render(<SimpleBotEditor botEditing={baseBot} onSwitchEditor={onSwitchEditor} />);

    const nameInput = screen.UNSAFE_getAllByType(TextInput)[0];
    fireEvent.changeText(nameInput, 'Freddy');
    await pressSave();

    expect(upsertBot).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Freddy',
        simple_editor: false,
        system_prompt: expect.stringContaining('Your name is Freddy.'),
      })
    );
    expect(onSwitchEditor).toHaveBeenCalledWith(
      expect.objectContaining({ bot_id: 'bot-9' })
    );
  });

  it('reports save failures without notifying the parent', async () => {
    (upsertBot as jest.Mock).mockRejectedValue(new Error('boom'));
    render(<SimpleBotEditor botEditing={baseBot} onSwitchEditor={onSwitchEditor} />);

    await pressSave();

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(onSwitchEditor).not.toHaveBeenCalled();
  });
});
