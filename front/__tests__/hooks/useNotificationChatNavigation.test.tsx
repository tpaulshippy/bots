import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname } from 'expo-router';
import { useNotificationChatNavigation } from '@/hooks/useNotificationChatNavigation';
import { fetchChat } from '@/api/chats';
import { fetchProfiles } from '@/api/profiles';
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
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/api/chats', () => ({
  fetchChat: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
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
  target?: string,
  deckId?: string,
  profileId?: string
): Notifications.NotificationResponse =>
  ({
    notification: {
      request: {
        identifier,
        content: {
          data: {
            ...(chatId ? { chat_id: chatId } : {}),
            ...(target ? { target } : {}),
            ...(deckId ? { deck_id: deckId } : {}),
            ...(profileId ? { profile_id: profileId } : {}),
          },
        },
      },
    },
  }) as unknown as Notifications.NotificationResponse;

function Harness() {
  useNotificationChatNavigation();
  return null;
}

// The cold-start clear runs in a fire-and-forget task after handling;
// wait for the mock instead of guessing flush depth.
const waitForClear = () =>
  waitFor(() =>
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled()
  );

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

  it('ignores unknown targets without a chat_id', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse(undefined, 'response-1', 'kid_chat'));
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

  it('opens the due study session when the reminder names a single deck', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(
        makeResponse(undefined, 'response-1', 'study_due', 'deck-1')
      );
    });

    expect(fetchChat).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards/study',
      params: { deckId: 'deck-1', mode: 'due', source: 'reminder' },
    });
  });

  it('switches to the reminder profile before opening the deck list', async () => {
    (fetchProfiles as jest.Mock).mockResolvedValue({
      count: 2,
      results: [
        { profile_id: 'kid-1', name: 'Maya' },
        { profile_id: 'kid-2', name: 'Leo' },
      ],
    });
    render(<Harness />);

    await act(async () => {
      await getListener()(
        makeResponse(undefined, 'response-1', 'study_due', undefined, 'kid-2')
      );
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify({ profile_id: 'kid-2', name: 'Leo' })
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards',
    });
  });

  it('skips the switch when the reminder profile is already selected', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ profile_id: 'kid-2', name: 'Leo' })
    );
    render(<Harness />);

    await act(async () => {
      await getListener()(
        makeResponse(undefined, 'response-1', 'study_due', undefined, 'kid-2')
      );
    });

    expect(fetchProfiles).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'selectedProfile',
      expect.anything()
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards',
    });
  });

  it('still navigates when the reminder profile cannot be resolved', async () => {
    (fetchProfiles as jest.Mock).mockResolvedValue(null);
    render(<Harness />);

    await act(async () => {
      await getListener()(
        makeResponse(undefined, 'response-1', 'study_due', undefined, 'kid-9')
      );
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards',
    });
  });

  it('opens the deck list when the reminder spans several decks', async () => {
    render(<Harness />);

    await act(async () => {
      await getListener()(makeResponse(undefined, 'response-1', 'study_due'));
    });

    expect(fetchChat).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/flashcards',
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

  it('clears the launch response after cold-start handling so it cannot re-fire', async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValue(
      makeResponse('chat-1')
    );

    render(<Harness />);
    await act(async () => {});

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { chatId: 'chat-1', title: 'Bot Name' },
    });
    await waitForClear();
    expect(
      Notifications.clearLastNotificationResponseAsync
    ).toHaveBeenCalled();
  });

  it('does not clear anything when there was no launch response', async () => {
    render(<Harness />);
    // Flush the cold-start task: with a null launch response it returns
    // before reaching the clear, so any flush depth suffices here.
    await act(async () => {});
    await act(async () => {});

    expect(
      Notifications.clearLastNotificationResponseAsync
    ).not.toHaveBeenCalled();
  });
});
