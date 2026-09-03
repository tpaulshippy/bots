import React from 'react';
import { render, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname } from 'expo-router';
import { useNotificationChatNavigation } from '@/hooks/useNotificationChatNavigation';
import { fetchChat } from '@/api/chats';
import { clearUser, getSessionMode } from '@/api/tokens';
import { UnauthorizedError } from '@/api/apiClient';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponse: jest.fn(() => null),
}));

jest.mock('@/api/chats', () => ({
  fetchChat: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(),
  getSessionMode: jest.fn(),
}));

const CHAT = {
  chat_id: 'chat-1',
  title: 'Chat Title',
  profile: { profile_id: 'kid-1', name: 'Kid' },
  bot: { name: 'Bot Name', bot_id: 'bot-1' },
};

const makeResponse = (
  chatId: string | undefined,
  identifier = 'response-1',
  target?: string
): Notifications.NotificationResponse =>
  ({
    notification: {
      request: {
        identifier,
        content: {
          data: {
            ...(chatId ? { chat_id: chatId } : {}),
            ...(target ? { target } : {}),
          },
        },
      },
    },
  }) as unknown as Notifications.NotificationResponse;

function Harness() {
  useNotificationChatNavigation();
  return null;
}

describe('useNotificationChatNavigation', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn() };

  const getListener = () =>
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
      .calls[0][0];

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (usePathname as jest.Mock).mockReturnValue('/');
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      null
    );
    (fetchChat as jest.Mock).mockResolvedValue(CHAT);
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });
  });

  it('switches to the chat profile before opening the chat on tap', async () => {
    const order: string[] = [];
    (AsyncStorage.setItem as jest.Mock).mockImplementation(() => {
      order.push('setItem');
      return Promise.resolve();
    });
    mockRouter.push.mockImplementation(() => {
      order.push('push');
    });

    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(fetchChat).toHaveBeenCalledWith('chat-1');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify(CHAT.profile)
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { chatId: 'chat-1', title: 'Bot Name' },
    });
    expect(order).toEqual(['setItem', 'push']);
  });

  it('falls back to the chat title when the chat has no bot', async () => {
    (fetchChat as jest.Mock).mockResolvedValue({ ...CHAT, bot: null });

    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { chatId: 'chat-1', title: 'Chat Title' },
    });
  });

  it('replaces instead of pushes when already on the chat screen', async () => {
    (usePathname as jest.Mock).mockReturnValue('/chat');

    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { chatId: 'chat-1', title: 'Bot Name' },
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('ignores responses without a chat_id', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse(undefined));
    });

    expect(fetchChat).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the parent transcript when the push targets parent_activity with a chat_id', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1', 'response-1', 'parent_activity'));
    });

    expect(fetchChat).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/parent/activityChat',
      params: { chatId: 'chat-1' },
    });
  });

  it('opens the parent activity inbox for digest pushes without a chat_id', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse(undefined, 'response-1', 'parent_activity'));
    });

    expect(fetchChat).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/parent/activity',
    });
  });

  it('does not navigate when the chat cannot be fetched', async () => {
    (fetchChat as jest.Mock).mockResolvedValue(null);

    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the chat when the app is cold-started by tapping a notification', async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      makeResponse('chat-1')
    );

    render(<Harness />);
    await act(async () => {});

    expect(fetchChat).toHaveBeenCalledWith('chat-1');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify(CHAT.profile)
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { chatId: 'chat-1', title: 'Bot Name' },
    });
  });

  it('handles the same response only once when delivered twice', async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      makeResponse('chat-1')
    );

    render(<Harness />);
    await act(async () => {});

    // Same response (same identifier) also delivered to the listener.
    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(fetchChat).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when the chat fetch is unauthorized', async () => {
    (fetchChat as jest.Mock).mockRejectedValue(new UnauthorizedError());

    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse('chat-1'));
    });

    expect(clearUser).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('removes the response listener on unmount', () => {
    const remove = jest.fn();
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue(
      { remove }
    );

    const { unmount } = render(<Harness />);
    unmount();

    expect(remove).toHaveBeenCalled();
  });
});
