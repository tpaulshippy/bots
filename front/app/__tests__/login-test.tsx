import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import LoginScreen from '../login';
import { getSessionMode, getTokens, setTokens } from '@/api/tokens';
import { getAccount } from '@/api/account';
import { fetchOwnProfile, fetchProfiles } from '@/api/profiles';
import { clearCachedPin, setCachedHasPin } from '@/api/pinStorage';
import * as WebBrowser from 'expo-web-browser';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  getTokens: jest.fn(),
  setTokens: jest.fn(),
  getSessionMode: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchOwnProfile: jest.fn(),
  fetchProfiles: jest.fn(),
}));

jest.mock('@/api/pinStorage', () => ({
  clearCachedPin: jest.fn(),
  setCachedHasPin: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getTokens as jest.Mock).mockResolvedValue(null);
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: false });
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });
    (fetchProfiles as jest.Mock).mockResolvedValue({ results: [], count: 0 });
    (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' });
  });

  it('renders the tagline with Google and Apple sign-in buttons', () => {
    render(<LoginScreen />);

    expect(screen.getByText('Safe AI bots for your students')).toBeTruthy();
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in-button')).toBeTruthy();
    // The legacy plaintext PIN cache is scrubbed on mount.
    expect(clearCachedPin).toHaveBeenCalled();
  });

  it('submits dev tokens and lands on home', async () => {
    const tokens = { access: 'access-token', refresh: 'refresh-token' };
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('dev-token-input'), JSON.stringify(tokens));
    fireEvent.press(screen.getByTestId('dev-submit-button'));

    await waitFor(() => expect(setTokens).toHaveBeenCalledWith(tokens));
    expect(setCachedHasPin).toHaveBeenCalledWith(false);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('completes Google login through the browser and refreshes the PIN flag', async () => {
    (getTokens as jest.Mock).mockResolvedValue({ access: 'a', refresh: 'r' });
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: true });
    render(<LoginScreen />);

    fireEvent.press(screen.getByTestId('google-sign-in-button'));

    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled());
    await waitFor(() => expect(setCachedHasPin).toHaveBeenCalledWith(true));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('locks teen-delegated sessions to their own profile without a PIN refresh', async () => {
    (getTokens as jest.Mock).mockResolvedValue({
      access: 'a',
      refresh: 'r',
      isTeenDelegated: true,
      activeProfileId: 'p9',
    });
    (fetchOwnProfile as jest.Mock).mockResolvedValue({ profile_id: 'p9', name: 'Maya' });
    // The notifying store checks the session lock before writing.
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: true,
      activeProfileId: 'p9',
    });
    render(<LoginScreen />);

    fireEvent.press(screen.getByTestId('google-sign-in-button'));

    await waitFor(() => expect(fetchOwnProfile).toHaveBeenCalled());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify({ profile_id: 'p9', name: 'Maya' })
    );
    expect(setCachedHasPin).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
