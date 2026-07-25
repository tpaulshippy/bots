import React from 'react';
import { render, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import ChildHome from '../index';
import { getTokens } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: jest.fn(() => null),
}));

jest.mock('@/api/tokens', () => ({
  getTokens: jest.fn(),
}));

const notificationResponse = {
  notification: {
    request: {
      identifier: 'response-1',
      content: { data: { chat_id: 'chat-1' } },
    },
  },
} as unknown as Notifications.NotificationResponse;

describe('ChildHome', () => {
  const mockRouter = { replace: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getTokens as jest.Mock).mockResolvedValue({ access: 'a', refresh: 'r' });
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      null
    );
  });

  it('redirects to login when there are no tokens', async () => {
    (getTokens as jest.Mock).mockResolvedValue(null);

    render(<ChildHome />);
    await act(async () => {});

    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('redirects to a new chat when the app was not launched by a notification', async () => {
    render(<ChildHome />);
    await act(async () => {});

    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it('does not redirect when the app was launched by tapping a chat notification', async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      notificationResponse
    );

    render(<ChildHome />);
    await act(async () => {});

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
