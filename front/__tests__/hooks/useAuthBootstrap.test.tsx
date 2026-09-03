import React from 'react';
import { render, act } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { fetchBots } from '@/api/bots';
import { fetchOwnProfile, fetchProfiles } from '@/api/profiles';
import { setTokens } from '@/api/tokens';
import { useRouter } from 'expo-router';

// Keep the real sessionFromQueryParams; mock the storage-touching helpers.
jest.mock('@/api/tokens', () => ({
  ...jest.requireActual('@/api/tokens'),
  setTokens: jest.fn(),
  clearUser: jest.fn(),
  getSessionMode: jest.fn(),
}));

import { getSessionMode } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  parse: jest.fn(),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  dismissBrowser: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
  fetchOwnProfile: jest.fn(),
}));

const TEEN_LOGIN_QUERY = {
  access: 'teen-access',
  refresh: 'teen-refresh',
  is_teen_delegated: 'true',
  active_profile_id: 'profile-maya',
};

function Harness({ loaded = true }: { loaded?: boolean }) {
  useAuthBootstrap(loaded);
  return null;
}

describe('useAuthBootstrap teen login deep link', () => {
  const mockRouter = { replace: jest.fn(), push: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(
      'syft://login?ignored=1'
    );
    (Linking.parse as jest.Mock).mockReturnValue({
      queryParams: TEEN_LOGIN_QUERY,
    });
    (fetchBots as jest.Mock).mockResolvedValue([]);
    (fetchOwnProfile as jest.Mock).mockResolvedValue({
      id: 3,
      profile_id: 'profile-maya',
      name: 'Maya',
    });
    (fetchProfiles as jest.Mock).mockResolvedValue({ results: [], count: 0 });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });
  });

  it('stores the token pair with delegation claims and locks the selected profile', async () => {
    render(<Harness />);
    await act(async () => {});

    expect(setTokens).toHaveBeenCalledWith({
      access: 'teen-access',
      refresh: 'teen-refresh',
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });

    // The locked profile is stored directly — the parent profile picker
    // endpoint is never consulted.
    expect(fetchOwnProfile).toHaveBeenCalled();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify({ id: 3, profile_id: 'profile-maya', name: 'Maya' })
    );
    expect(fetchProfiles).not.toHaveBeenCalled();
  });

  it('falls back to the claimed profile id when self-fetch fails', async () => {
    // Real fetchOwnProfile resolves to null on failure rather than rejecting.
    (fetchOwnProfile as jest.Mock).mockResolvedValue(null);

    render(<Harness />);
    await act(async () => {});

    const call = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
      ([key]) => key === 'selectedProfile'
    );
    expect(call).toBeDefined();
    expect(JSON.parse(call![1])).toEqual({ profile_id: 'profile-maya' });
  });

  it('does not store a profile for parent logins (picker flow unchanged)', async () => {
    (Linking.parse as jest.Mock).mockReturnValue({
      queryParams: { access: 'a', refresh: 'r' },
    });
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<Harness />);
    await act(async () => {});

    expect(setTokens).toHaveBeenCalledWith({
      access: 'a',
      refresh: 'r',
      isTeenDelegated: false,
      activeProfileId: null,
    });
    expect(fetchOwnProfile).not.toHaveBeenCalled();
    // Parent sessions still run the normal profile repair.
    expect(fetchProfiles).toHaveBeenCalled();
  });
});
