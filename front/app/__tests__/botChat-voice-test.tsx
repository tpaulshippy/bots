import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import Chat from '../botChat';
import { fetchChatMessages, sendVoice } from '@/api/chats';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('@/api/chats', () => ({
  fetchChatMessages: jest.fn(),
  sendChat: jest.fn(),
  sendVoice: jest.fn(),
}));

jest.mock('@/components/ChatMessage', () => {
  const { Text } = require('react-native');
  const MockChatMessage = ({ message }: { message: { text: string } }) => (
    <Text>{message.text}</Text>
  );
  MockChatMessage.displayName = 'MockChatMessage';
  return MockChatMessage;
});

const mockParams = (chatId: string | null) =>
  (useLocalSearchParams as jest.Mock).mockReturnValue(
    chatId ? { chatId } : {}
  );

describe('Chat voice mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams('chat-A');
    (fetchChatMessages as jest.Mock).mockResolvedValue({
      results: [],
      next: null,
      count: 0,
    });
  });

  const renderWithStorage = async (
    botOverrides = {},
    profileOverrides = {}
  ) => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'selectedProfile') {
        return Promise.resolve(
          JSON.stringify({ profile_id: 'profile-1', ...profileOverrides })
        );
      }
      if (key === 'selectedBot') {
        return Promise.resolve(JSON.stringify({ bot_id: 'bot-1', ...botOverrides }));
      }
      return Promise.resolve(null);
    });
    const rendered = render(<Chat />);
    await act(async () => {});
    return rendered;
  };

  it('hides the mic toggle when the bot or profile has voice disabled', async () => {
    await renderWithStorage({ enable_voice: false }, { voice_enabled: true });
    expect(screen.queryByTestId('voice-mode-toggle')).toBeNull();
    expect(screen.getByTestId('chat-input')).toBeOnTheScreen();
  });

  it('shows the mic toggle when both bot and profile have voice enabled', async () => {
    await renderWithStorage({ enable_voice: true }, { voice_enabled: true });
    expect(screen.getByTestId('voice-mode-toggle')).toBeOnTheScreen();
  });

  it('replaces the composer with hold-to-talk when voice mode is on', async () => {
    await renderWithStorage({ enable_voice: true }, { voice_enabled: true });
    fireEvent.press(screen.getByTestId('voice-mode-toggle'));
    await act(async () => {});
    expect(screen.getByTestId('voice-hold')).toBeOnTheScreen();
    expect(screen.getByTestId('tts-autoplay-toggle')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-input')).toBeNull();
  });

  it('sends the recording to the voice endpoint when released', async () => {
    (sendVoice as jest.Mock).mockResolvedValue({
      chat_id: 'chat-A',
      response: 'Photosynthesis makes energy.',
      user_message: 'What is photosynthesis?',
      audio_base64: null,
    });
    await renderWithStorage({ enable_voice: true }, { voice_enabled: true });
    fireEvent.press(screen.getByTestId('voice-mode-toggle'));
    await act(async () => {});

    const holdButton = screen.getByTestId('voice-hold');
    await act(async () => {
      fireEvent(holdButton, 'pressOut');
    });

    expect(sendVoice).toHaveBeenCalledWith(
      'chat-A',
      expect.any(FormData)
    );
    expect(screen.getByText('What is photosynthesis?')).toBeOnTheScreen();
    expect(screen.getByText('Photosynthesis makes energy.')).toBeOnTheScreen();
  });
});
