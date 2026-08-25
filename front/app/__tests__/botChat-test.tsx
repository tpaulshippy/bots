import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import Chat from '../botChat';
import { fetchChatMessages, streamChatMessage, ChatStreamEvent } from '@/api/chats';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/api/chats', () => ({
  fetchChatMessages: jest.fn(),
  streamChatMessage: jest.fn(),
}));

// Light stand-in for ChatMessage: renders the streamed text and the Retry
// action without pulling markdown rendering into the test.
jest.mock('@/components/ChatMessage', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return function ChatMessageMock({ message, onRetry }: any) {
    if (message.role !== 'assistant') return null;
    return (
      <>
        <Text testID="assistant-text">{message.text}</Text>
        {message.isLoading ? <Text testID="assistant-loading">loading</Text> : null}
        {message.failed && onRetry ? (
          <TouchableOpacity testID="retry-button" onPress={onRetry}>
            <Text>retry</Text>
          </TouchableOpacity>
        ) : null}
        {(message.agentEvents ?? []).map((chip: any, i: number) => (
          <Text key={i} testID={`agent-chip-${chip.kind === 'deck' ? 'deck' : 'other'}`}>
            {chip.kind === 'deck' ? `${chip.name}:${chip.cardCount}` : chip.label}
          </Text>
        ))}
      </>
    );
  };
});

describe('Chat streaming', () => {
  const emit = (events: ChatStreamEvent[]) => {
    const onEvent = (streamChatMessage as jest.Mock).mock.calls[0][0].onEvent;
    events.forEach(onEvent);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ chatId: undefined });
    (fetchChatMessages as jest.Mock).mockResolvedValue({
      results: [],
      next: null,
      count: 0,
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'selectedProfile') {
        return Promise.resolve(JSON.stringify({ profile_id: 'profile-1' }));
      }
      if (key === 'selectedBot') {
        return Promise.resolve(JSON.stringify({ bot_id: 'bot-1' }));
      }
      return Promise.resolve(null);
    });
    (streamChatMessage as jest.Mock).mockImplementation(async () => {});
  });

  it('shows a stop button while streaming and aborts when pressed', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    (streamChatMessage as jest.Mock).mockImplementation(() => gate);

    const { getByTestId, queryByTestId } = render(<Chat />);
    await act(async () => {});

    fireEvent.changeText(getByTestId('chat-input'), 'hello');
    await act(async () => {
      fireEvent.press(getByTestId('send-button'));
    });
    await act(async () => {});

    expect(streamChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'new', message: 'hello' })
    );
    // Stop button replaces send while in flight.
    expect(getByTestId('stop-button')).toBeTruthy();
    expect(queryByTestId('send-button')).toBeNull();

    const signal = (streamChatMessage as jest.Mock).mock.calls[0][0].signal;
    fireEvent.press(getByTestId('stop-button'));
    expect(signal.aborted).toBe(true);

    release();
    await act(async () => {});
    expect(queryByTestId('stop-button')).toBeNull();
  });

  it('grows the assistant bubble from token events and shows deck chips', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    (streamChatMessage as jest.Mock).mockImplementation(async ({ onEvent }: any) => {
      emit([
        { type: 'meta', chatId: 'chat-9' },
        { type: 'token', text: 'Mitosis has four' },
        { type: 'tool_start', tool: 'create_flashcard_deck' },
        { type: 'tool_end', tool: 'create_flashcard_deck', deckId: 'deck-1', name: 'Cell Bio', cardCount: 8 },
        { type: 'token', text: ' main stages.' },
        { type: 'done' },
      ]);
      await gate;
    });

    const { getByTestId, getAllByTestId } = render(<Chat />);
    await act(async () => {});

    fireEvent.changeText(getByTestId('chat-input'), 'teach me');
    await act(async () => {
      fireEvent.press(getByTestId('send-button'));
    });
    await act(async () => {});

    // Tokens accumulated into the growing bubble.
    const texts = getAllByTestId('assistant-text').map((n) => n.props.children);
    expect(texts.join('')).toContain('main stages.');

    // Tool chip for the created deck is visible.
    expect(getAllByTestId('agent-chip-deck').length).toBeGreaterThan(0);

    await act(async () => {
      release();
    });
    await act(async () => {});
  });

  it('marks the bubble failed with retry after a stream error', async () => {
    (streamChatMessage as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { getByTestId } = render(<Chat />);
    await act(async () => {});

    fireEvent.changeText(getByTestId('chat-input'), 'hello');
    await act(async () => {
      fireEvent.press(getByTestId('send-button'));
    });
    await act(async () => {});

    expect(getByTestId('retry-button')).toBeTruthy();

    (streamChatMessage as jest.Mock).mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    expect(streamChatMessage).toHaveBeenCalledTimes(2);
    expect(streamChatMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'hello' })
    );
  });
});
