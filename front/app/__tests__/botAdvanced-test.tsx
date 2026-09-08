import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { useNavigation, useRouter } from 'expo-router';

import AdvancedBotEditor from '../parent/botAdvanced';
import { upsertBot } from '@/api/bots';
import type { Bot } from '@/api/bots';
import { fetchAiModels } from '@/api/aiModels';
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

const baseBot: Bot = {
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

describe('AdvancedBotEditor', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  let headerRight: (() => React.ReactElement) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    headerRight = undefined;
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: (opts: { headerRight?: () => React.ReactElement }) => {
        headerRight = opts.headerRight;
      },
    });
    (fetchAiModels as jest.Mock).mockResolvedValue({
      results: models,
      count: models.length,
    });
    (upsertBot as jest.Mock).mockResolvedValue(baseBot);
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

  it('shows the saved name, model, prompt, and delete action', async () => {
    render(<AdvancedBotEditor botEditing={baseBot} />);

    await waitFor(() => expect(screen.getByText('Spark')).toBeTruthy());
    expect(screen.getByDisplayValue('Freddy')).toBeTruthy();
    expect(screen.getByDisplayValue('Be nice')).toBeTruthy();
    expect(screen.getByText('Delete Bot')).toBeTruthy();
    expect(screen.getByTestId('baseline-safety-note')).toBeTruthy();
  });

  it('saves name edits through the header and goes back', async () => {
    render(<AdvancedBotEditor botEditing={baseBot} />);
    await waitFor(() => expect(screen.getByText('Spark')).toBeTruthy());

    fireEvent.changeText(screen.getByDisplayValue('Freddy'), 'Fred');
    await pressSave();

    expect(upsertBot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fred' })
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('asks for confirmation before deleting', async () => {
    render(<AdvancedBotEditor botEditing={baseBot} />);
    await waitFor(() => expect(screen.getByText('Spark')).toBeTruthy());

    fireEvent.press(screen.getByText('Delete Bot'));

    expect(mockAlert).toHaveBeenCalledWith(
      'Delete Bot',
      'Are you sure you want to delete this bot?',
      expect.any(Array)
    );
    const options = mockAlert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void | Promise<void>;
    }[];
    await act(async () => {
      await options.find((option) => option.text === 'Delete')?.onPress?.();
    });

    expect(upsertBot).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(Date) })
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('stays on screen when saving fails', async () => {
    (upsertBot as jest.Mock).mockRejectedValue(new Error('boom'));
    render(<AdvancedBotEditor botEditing={baseBot} />);
    await waitFor(() => expect(screen.getByText('Spark')).toBeTruthy());

    await pressSave();

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
