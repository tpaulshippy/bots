import renderer from 'react-test-renderer';
import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
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

jest.mock('@/api/pinStorage', () => ({
  setCachedPin: jest.fn(),
  getCachedPin: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@/api/tokens', () => ({
  setTokens: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(() => Promise.resolve({ pin: null })),
}));

jest.mock('@expo/vector-icons', () => ({}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

import LoginScreen from '@/app/login';

describe('Login UI Screenshot Tests', () => {
  it('renders Login screen correctly', async () => {
    const tree = renderer.create(<LoginScreen />);
    expect(tree).toMatchSnapshot();
  });
});