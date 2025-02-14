import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { useRouter, usePathname, Stack as ExpoStack } from 'expo-router';
import RootLayout from '../_layout';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { fetchBots } from '@/api/bots';
import { fetchChat } from '@/api/chats';
import { UnauthorizedError } from '@/api/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';

// Create a mock Stack component
const Stack = ({ children }: { children: React.ReactNode }) => (
  <View testID="mock-stack">{children}</View>
);

Stack.Screen = ({ name, options }: { name: string; options?: any }) => null;

// Mock modules before tests
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    Stack,
    useRouter: jest.fn(),
    usePathname: jest.fn(),
  };
});

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true],
}));

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#000000',
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

jest.mock('@/api/chats', () => ({
  fetchChat: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  removeNotificationSubscription: jest.fn(),
}));

describe('RootLayout', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (usePathname as jest.Mock).mockReturnValue('/');
    (fetchBots as jest.Mock).mockResolvedValue({ count: 1 });
    (fetchChat as jest.Mock).mockResolvedValue({
      chat_id: '123',
      title: 'Test Chat',
      profile: { profile_id: '456' },
      bot: { name: 'Test Bot' }
    });
  });

  it('initializes and handles authentication correctly', async () => {
    render(<RootLayout />);

    // Wait for initialization
    await act(async () => {
      await Promise.resolve();
    });

    // Should call fetchBots during initialization
    expect(fetchBots).toHaveBeenCalled();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('redirects to initial bot selection when no bots exist', async () => {
    (fetchBots as jest.Mock).mockResolvedValue({ count: 0 });

    render(<RootLayout />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/parent/initialBotSelection');
  });

  it('redirects to login on unauthorized error', async () => {
    (fetchBots as jest.Mock).mockRejectedValue(new UnauthorizedError());

    render(<RootLayout />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('handles chat navigation correctly', async () => {
    (usePathname as jest.Mock).mockReturnValue('/chat');
    
    render(<RootLayout />);

    // Simulate notification response with chat data
    const mockNotificationHandler = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
    
    await act(async () => {
      await mockNotificationHandler({
        notification: {
          request: {
            content: {
              data: { chat_id: '123' }
            }
          }
        }
      });
    });

    // Should replace the current route when already on chat
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/chat',
      params: expect.any(Object)
    }));
  });

  it('sets up and cleans up notification listeners', () => {
    const { unmount } = render(<RootLayout />);

    expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();

    unmount();

    expect(Notifications.removeNotificationSubscription).toHaveBeenCalled();
  });
}); 