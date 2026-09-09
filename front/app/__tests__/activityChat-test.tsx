import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import ActivityChatScreen from '../parent/activityChat';
import { fetchActivityChat } from '@/api/activity';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useNavigation: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

// Avoid pulling markdown rendering into the test; assert on the stub props.
jest.mock('@/components/ChatMessage', () => 'ChatMessage');

jest.mock('@/api/activity', () => ({
  fetchActivityChat: jest.fn(),
}));

const detail = {
  chat_id: 'chat-1',
  title: 'Space chat',
  profile: { profile_id: 'p1', name: 'Maya' },
  bot: null,
  message_count: 2,
  last_message_preview: 'Hi there',
  last_message_at: '2026-01-01T12:01:00Z',
  safety_event_count: 1,
  messages: [
    {
      message_id: 'm1',
      order: 1,
      role: 'user',
      text: 'Hello bot',
      created_at: '2026-01-01T12:00:00Z',
      image_url: null,
    },
    {
      message_id: 'm2',
      order: 2,
      role: 'assistant',
      text: 'Hi there',
      created_at: '2026-01-01T12:01:00Z',
      image_url: null,
    },
  ],
  safety_events: [
    {
      event_id: 'e1',
      stage: 'output',
      reason_code: 'blocked',
      snippet_redacted: '',
      created_at: '2026-01-01T12:01:00Z',
      message_order: 2,
      summary: 'Blocked content',
    },
  ],
};

describe('ActivityChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ chatId: 'chat-1' });
  });

  it('shows a loading indicator while the transcript loads', () => {
    (fetchActivityChat as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<ActivityChatScreen />);

    expect(screen.getByTestId('activity-transcript-loading')).toBeTruthy();
    expect(fetchActivityChat).toHaveBeenCalledWith('chat-1');
  });

  it('renders the transcript, message count, and safety marker', async () => {
    (fetchActivityChat as jest.Mock).mockResolvedValue(detail);

    render(<ActivityChatScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-transcript-list')).toBeTruthy()
    );
    expect(screen.getByTestId('activity-transcript-subtitle')).toHaveTextContent(
      'Read only · 2 messages'
    );
    expect(screen.getByTestId('activity-safety-marker')).toHaveTextContent(
      '⚠ Blocked content'
    );

    const bubbles = screen.UNSAFE_getAllByType('ChatMessage' as never);
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].props.message.text).toBe('Hello bot');
  });

  it('shows an unavailable state when the chat is not found', async () => {
    (fetchActivityChat as jest.Mock).mockResolvedValue(null);

    render(<ActivityChatScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('activity-transcript-missing')).toBeTruthy()
    );
    expect(
      screen.getByText('This conversation is unavailable.')
    ).toBeTruthy();
  });

  it('shows unavailable without fetching when the chatId param is missing', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});

    render(<ActivityChatScreen />);

    expect(screen.getByTestId('activity-transcript-missing')).toBeTruthy();
    expect(fetchActivityChat).not.toHaveBeenCalled();
  });
});
