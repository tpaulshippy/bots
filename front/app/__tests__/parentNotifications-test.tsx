import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import NotificationsScreen from '../parent/notifications';
import {
  fetchDevice,
  fetchDeviceByToken,
  upsertDevice,
  getDeviceIdFromStorage,
  setDeviceIdInStorage,
} from '@/api/devices';
import * as Notifications from 'expo-notifications';

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 'max' },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project' } } },
  easConfig: { projectId: 'test-project' },
}));

jest.mock('@/api/devices', () => ({
  fetchDevice: jest.fn(),
  fetchDeviceByToken: jest.fn(),
  upsertDevice: jest.fn(),
  getDeviceIdFromStorage: jest.fn(),
  setDeviceIdInStorage: jest.fn(),
}));

const storedDevice = {
  id: 7,
  device_id: 'dev-1',
  notification_token: 'ExponentPushToken[abc]',
  notify_on_new_chat: true,
  notify_on_new_message: false,
  notify_digest_only: false,
  deleted_at: null,
};

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue(null);
    (fetchDevice as jest.Mock).mockResolvedValue(null);
    (fetchDeviceByToken as jest.Mock).mockResolvedValue(null);
    (upsertDevice as jest.Mock).mockResolvedValue(storedDevice);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[abc]',
    });
  });

  it('renders all three toggles defaulting to off when no device is stored', async () => {
    render(<NotificationsScreen />);

    await waitFor(() =>
      expect(getDeviceIdFromStorage).toHaveBeenCalled()
    );

    expect(screen.getByText('Notify on new chat')).toBeTruthy();
    expect(screen.getByText('Notify on each message')).toBeTruthy();
    expect(screen.getByText('Daily digest only')).toBeTruthy();
    expect(
      screen.getByTestId('notify-new-chat-switch').props.value
    ).toBe(false);
    expect(
      screen.getByTestId('notify-new-message-switch').props.value
    ).toBe(false);
    expect(
      screen.getByTestId('notify-digest-only-switch').props.value
    ).toBe(false);
  });

  it('loads stored device flags into the switches', async () => {
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('dev-1');
    (fetchDevice as jest.Mock).mockResolvedValue(storedDevice);

    render(<NotificationsScreen />);

    await waitFor(() =>
      expect(
        screen.getByTestId('notify-new-chat-switch').props.value
      ).toBe(true)
    );
    expect(
      screen.getByTestId('notify-new-message-switch').props.value
    ).toBe(false);
    expect(
      screen.getByTestId('notify-digest-only-switch').props.value
    ).toBe(false);
  });

  it('toggling digest-only persists flags and disables the instant toggles', async () => {
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('dev-1');
    (fetchDevice as jest.Mock).mockResolvedValue(storedDevice);

    render(<NotificationsScreen />);

    await waitFor(() =>
      expect(
        screen.getByTestId('notify-new-chat-switch').props.value
      ).toBe(true)
    );

    fireEvent(
      screen.getByTestId('notify-digest-only-switch'),
      'onValueChange',
      true
    );

    await waitFor(() =>
      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          notify_on_new_chat: true,
          notify_on_new_message: false,
          notify_digest_only: true,
        })
      )
    );
    expect(
      screen.getByTestId('notify-digest-only-switch').props.value
    ).toBe(true);
    expect(
      screen.getByTestId('notify-new-chat-switch').props.disabled
    ).toBe(true);
    expect(
      screen.getByTestId('notify-new-message-switch').props.disabled
    ).toBe(true);
  });

  it('registers a push token and creates a device on first toggle when nothing is cached', async () => {
    const saved = { ...storedDevice, id: 9, device_id: 'dev-9' };
    (upsertDevice as jest.Mock).mockResolvedValue(saved);

    render(<NotificationsScreen />);

    await waitFor(() =>
      expect(getDeviceIdFromStorage).toHaveBeenCalled()
    );

    fireEvent(
      screen.getByTestId('notify-new-chat-switch'),
      'onValueChange',
      true
    );

    await waitFor(() =>
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: -1,
          notification_token: 'ExponentPushToken[abc]',
          notify_on_new_chat: true,
        })
      )
    );
    expect(setDeviceIdInStorage).toHaveBeenCalledWith('dev-9');
  });
});
