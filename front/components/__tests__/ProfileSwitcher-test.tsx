import React from 'react';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { ProfileSwitcher } from '../ProfileSwitcher';
import { fetchProfiles } from '@/api/profiles';
import { getAccount } from '@/api/account';
import { isTeenDelegatedSession } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  isTeenDelegatedSession: jest.fn(() => Promise.resolve(false)),
}));

const profiles = [
  { id: 1, profile_id: 'profile-maya', name: 'Maya', deleted_at: null },
  { id: 2, profile_id: 'profile-leo', name: 'Leo', deleted_at: null },
];

describe('ProfileSwitcher', () => {
  const mockRouter = { push: jest.fn() };
  let storedProfile: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: profiles,
      count: profiles.length,
    });
    (isTeenDelegatedSession as jest.Mock).mockResolvedValue(false);
    (getAccount as jest.Mock).mockResolvedValue({ pin: 1234 });
    // Stateful fake so switching updates what getItem returns, like the
    // real AsyncStorage.
    storedProfile = JSON.stringify(profiles[0]);
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'selectedProfile') {
        return Promise.resolve(storedProfile);
      }
      return Promise.resolve(null);
    });
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        if (key === 'selectedProfile') {
          storedProfile = value;
        }
      }
    );
  });

  it('shows the current kid chip', async () => {
    render(<ProfileSwitcher />);

    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-chip')).toBeTruthy()
    );
    expect(screen.getByText('Maya')).toBeTruthy();
  });

  it('switching profiles stores the new selected profile id', async () => {
    render(<ProfileSwitcher />);
    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-chip')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-option-Leo')).toBeTruthy()
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-switcher-option-Leo'));
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify(profiles[1])
    );
    // The chip reflects the switch immediately.
    await waitFor(() => expect(screen.getByText('Leo')).toBeTruthy());
  });

  it('marks the selected profile with a checkmark in the list', async () => {
    render(<ProfileSwitcher />);
    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-chip')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));

    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-option-Maya')).toBeTruthy()
    );
    expect(screen.getByText("Who's chatting?")).toBeTruthy();
  });

  it('routes Manage profiles through the PIN gate', async () => {
    render(<ProfileSwitcher />);
    await waitFor(() =>
      expect(screen.getByTestId('profile-switcher-chip')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    fireEvent.press(screen.getByTestId('profile-switcher-manage'));
    await act(async () => {});

    // PIN gate is up instead of navigating straight to the profiles list.
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByText('Enter PIN')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('pin-input'), '1234');
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/parent/profilesList');
    });
  });

  it('is display-only for teen delegated sessions', async () => {
    (isTeenDelegatedSession as jest.Mock).mockResolvedValue(true);

    render(<ProfileSwitcher />);
    await waitFor(() =>
      expect(screen.getByText('Maya')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('profile-switcher-chip'));
    await act(async () => {});

    expect(screen.queryByText("Who's chatting?")).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'selectedProfile',
      expect.anything()
    );
  });
});
