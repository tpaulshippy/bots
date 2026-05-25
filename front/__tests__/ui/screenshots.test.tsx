import renderer from 'react-test-renderer';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(JSON.stringify({ profile_id: 'test-profile-id' }))),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

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

jest.mock('@react-navigation/elements', () => ({
  PlatformPressable: 'PlatformPressable',
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('@/api/chats', () => ({
  fetchChats: jest.fn(() => Promise.resolve({ results: [], next: null })),
  fetchChatMessages: jest.fn(() => Promise.resolve({ results: [], next: null })),
  sendChat: jest.fn(() => Promise.resolve({ response: 'Test response', chat_id: 'test-chat-id' })),
}));

jest.mock('@/api/flashcards', () => ({
  fetchDecks: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock('@/api/tokens', () => ({
  setTokens: jest.fn(),
  clearUser: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(() => Promise.resolve({ pin: '1234', costForToday: [10], maxDailyCost: 100, subscriptionLevel: 0 })),
}));

jest.mock('@/constants/subscriptions', () => ({
  subscriptionNames: ['Free', 'Basic', 'Premium'],
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));

import ChatList from '@/app/chatList';
import Flashcards from '@/app/flashcards';
import SelectBot from '@/app/selectBot';
import ProfilesList from '@/app/parent/profilesList';
import SettingsScreen from '@/app/parent/settings';

describe('UI Screenshot Tests', () => {
  it('renders ChatList screen correctly', async () => {
    const tree = renderer.create(<ChatList />);
    expect(tree).toMatchSnapshot();
  });

  it('renders Flashcards screen correctly', async () => {
    const tree = renderer.create(<Flashcards />);
    expect(tree).toMatchSnapshot();
  });

  it('renders SelectBot screen correctly', async () => {
    const tree = renderer.create(<SelectBot />);
    expect(tree).toMatchSnapshot();
  });

  it('renders ProfilesList screen correctly', async () => {
    const tree = renderer.create(<ProfilesList />);
    expect(tree).toMatchSnapshot();
  });

  it('renders Settings screen correctly', async () => {
    const tree = renderer.create(<SettingsScreen />);
    expect(tree).toMatchSnapshot();
  });
});