import renderer from 'react-test-renderer';
import React from 'react';

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: (props: any, colorName: string) => {
    const colors: Record<string, string> = {
      text: '#11181C',
      background: '#eee',
      tint: '#00a4c9',
      icon: '#687076',
      cardBackground: '#fff',
      cardBackgroundSelected: '#00a4c9',
      border: '#ccc',
    };
    return props?.light || props?.dark || colors[colorName] || '#000';
  },
}));

jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: 'IconSymbol',
}));

jest.mock('@expo/vector-icons', () => ({}));

jest.mock('react-native-webview', () => ({}));

import ChatMessage from '@/components/ChatMessage';
import { ChatMessage as ApiChatMessage } from '@/api/chats';

describe('ChatMessage UI Screenshot Tests', () => {
  const userMessage: ApiChatMessage = {
    role: 'user',
    text: 'Hello, this is a test message from the user.',
    image_url: null,
  };

  const assistantMessage: ApiChatMessage = {
    role: 'assistant',
    text: 'This is a response from the assistant with **markdown** formatting.',
    image_url: null,
  };

  const loadingMessage: ApiChatMessage = {
    role: 'assistant',
    text: '',
    image_url: null,
    isLoading: true,
  };

  it('renders user message correctly', () => {
    const tree = renderer.create(<ChatMessage message={userMessage} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders assistant message correctly', () => {
    const tree = renderer.create(<ChatMessage message={assistantMessage} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders loading message correctly', () => {
    const tree = renderer.create(<ChatMessage message={loadingMessage} />);
    expect(tree).toMatchSnapshot();
  });
});