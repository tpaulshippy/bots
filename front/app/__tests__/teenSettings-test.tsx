import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import SettingsScreen from '../settings';
import { clearUser } from '@/api/tokens';
import {
  fetchDevice,
  fetchDeviceByToken,
  upsertDevice,
  getDeviceIdFromStorage,
} from '@/api/devices';
import * as Notifications from 'expo-notifications';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(),
}));

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
  notify_on_new_message: true,
  notify_digest_only: false,
  notify_study_due: false,
  deleted_at: null,
};

describe('Teen SettingsScreen', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
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

  it('exposes only the study-reminder opt-in (no parent surveillance toggles)', async () => {
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(getDeviceIdFromStorage).toHaveBeenCalled()
    );

    expect(screen.getByText('Study reminders')).toBeTruthy();
    expect(screen.getByTestId('teen-study-due-switch')).toBeTruthy();
    // Parent-only surfaces must not leak onto the teen screen.
    expect(screen.queryByText('Notify on new chat')).toBeNull();
    expect(screen.queryByText('Notify on each message')).toBeNull();
    expect(screen.queryByText('Daily digest only')).toBeNull();
  });

  it('loads the stored study-due flag', async () => {
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('dev-1');
    (fetchDevice as jest.Mock).mockResolvedValue({
      ...storedDevice,
      notify_study_due: true,
    });

    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('teen-study-due-switch').props.value).toBe(true)
    );
  });

  it('toggling study reminders preserves the parent flags (read-modify-write)', async () => {
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('dev-1');
    (fetchDevice as jest.Mock).mockResolvedValue(storedDevice);

    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('teen-study-due-switch').props.value).toBe(false)
    );

    fireEvent(
      screen.getByTestId('teen-study-due-switch'),
      'onValueChange',
      true
    );

    await waitFor(() =>
      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          notify_study_due: true,
          // Parent flags untouched.
          notify_on_new_chat: true,
          notify_on_new_message: true,
          notify_digest_only: false,
        })
      )
    );
  });

  it('disables the switch while digest-only suppresses reminders', async () => {
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('dev-1');
    (fetchDevice as jest.Mock).mockResolvedValue({
      ...storedDevice,
      notify_digest_only: true,
    });

    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('teen-study-due-switch').props.disabled).toBe(true)
    );
    expect(screen.getByText(/Paused while Daily digest only is on/)).toBeTruthy();
  });

  it('logs out back to the login screen', async () => {
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(getDeviceIdFromStorage).toHaveBeenCalled()
    );

    fireEvent.press(screen.getByTestId('teen-log-out'));

    await waitFor(() => expect(clearUser).toHaveBeenCalled());
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('opens the terms and privacy documents', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(getDeviceIdFromStorage).toHaveBeenCalled()
    );

    fireEvent.press(screen.getByTestId('teen-terms-use'));
    expect(openURL).toHaveBeenCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
    );

    fireEvent.press(screen.getByTestId('teen-privacy-policy'));
    expect(openURL).toHaveBeenCalledWith(
      'https://www.freeprivacypolicy.com/live/6f20c0b8-408b-481d-a474-d3f589746d7b'
    );
    openURL.mockRestore();
  });
});
