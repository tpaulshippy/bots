import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import Chat from '../botChat';
import { fetchChatMessages, sendChat } from '@/api/chats';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('@/api/chats', () => ({
  fetchChatMessages: jest.fn(),
  sendChat: jest.fn(),
}));

// Avoid pulling markdown rendering into the test; messages stay empty.
jest.mock('@/components/ChatMessage', () => 'ChatMessage');

describe('Chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ chatId: 'chat-A' });
    (fetchChatMessages as jest.Mock).mockResolvedValue({
      results: [],
      next: null,
      count: 0,
    });
    (sendChat as jest.Mock).mockResolvedValue({
      chat_id: 'chat-B',
      response: 'hi',
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
  });

  it('sends to the chat from the latest params after they change', async () => {
    const { rerender } = render(<Chat />);
    await act(async () => {});

    // Notification opened a different chat while already on the chat screen.
    (useLocalSearchParams as jest.Mock).mockReturnValue({ chatId: 'chat-B' });
    rerender(<Chat />);
    await act(async () => {});

    fireEvent.changeText(screen.getByTestId('chat-input'), 'hello');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-button'));
    });

    expect(sendChat).toHaveBeenCalledWith('chat-B', expect.any(FormData));
  });
});
