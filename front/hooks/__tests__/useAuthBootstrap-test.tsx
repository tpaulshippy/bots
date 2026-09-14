import React from 'react';
import { render, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { useAuthBootstrap } from '../useAuthBootstrap';
import { fetchBots, tryFetchBot } from '@/api/bots';
import { fetchOwnProfile, fetchProfiles, tryFetchProfile } from '@/api/profiles';
import { getSessionMode } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-linking', () => ({
  parse: jest.fn(),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-web-browser', () => ({
  dismissBrowser: jest.fn(),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
  tryFetchBot: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
  fetchOwnProfile: jest.fn(),
  tryFetchProfile: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(() => Promise.resolve()),
  getSessionMode: jest.fn(),
  sessionFromQueryParams: jest.fn(() => null),
  setTokens: jest.fn(() => Promise.resolve()),
}));

const mockRouter = { replace: jest.fn() };

function Probe() {
  useAuthBootstrap(true);
  return null;
}

async function bootstrap() {
  render(<Probe />);
  await act(async () => {});
}

describe('useAuthBootstrap bot selection repair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: false,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: [{ profile_id: 'p1', name: 'Jordan' }],
      count: 1,
    });
    (fetchOwnProfile as jest.Mock).mockResolvedValue(null);
    (tryFetchProfile as jest.Mock).mockResolvedValue(null);
    (fetchBots as jest.Mock).mockResolvedValue({
      results: [{ bot_id: 'b1', name: 'Penelope' }],
      count: 1,
    });
    (tryFetchBot as jest.Mock).mockResolvedValue(null);
  });

  it('keeps a stored bot selection owned by the current account', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
          : null
      )
    );

    await bootstrap();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('selectedBot');
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'selectedBot',
      expect.anything()
    );
  });

  it('drops a foreign bot selection and reseeds from the live list', async () => {
    // Previous account's bot left in storage across a shared-device login.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'bx', name: 'Other Account Bot' })
          : null
      )
    );
    // Confirmed 404 (not a transient failure): safe to clear and reseed.
    (tryFetchBot as jest.Mock).mockResolvedValue('missing');

    await bootstrap();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedBot',
      JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
    );
  });

  it('keeps the stored selection when the bot list cannot load', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
          : null
      )
    );
    (fetchBots as jest.Mock).mockResolvedValue(null);

    await bootstrap();

    // Offline must not strand the user with no bot selected.
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('selectedBot');
  });

  it('keeps a valid bot that lives beyond the first list page', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'b51', name: 'Late Bot' })
          : null
      )
    );
    (tryFetchBot as jest.Mock).mockResolvedValue({
      bot_id: 'b51',
      name: 'Late Bot',
    });

    await bootstrap();

    // Page one doesn't have it, but the single-bot lookup proves ownership.
    expect(tryFetchBot).toHaveBeenCalledWith('b51');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('selectedBot');
  });

  it('repairs a foreign bot selection for teen-delegated sessions too', async () => {
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: true,
      activeProfileId: 'p1',
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'bx', name: 'Other Account Bot' })
          : key === 'selectedProfile'
            ? JSON.stringify({ profile_id: 'p1', name: 'Jordan' })
            : null
      )
    );
    (tryFetchBot as jest.Mock).mockResolvedValue('missing');

    await bootstrap();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedBot',
      JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
    );
  });

  it('keeps an unverifiable selection when the single lookup fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'bx', name: 'Maybe Mine' })
          : null
      )
    );
    // Transient failure (not a confirmed 404): must not clear.
    (tryFetchBot as jest.Mock).mockResolvedValue(null);

    await bootstrap();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith('selectedBot');
  });

  it('drops a soft-deleted bot that the detail endpoint still returns', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedBot'
          ? JSON.stringify({ bot_id: 'b9', name: 'Old Bot' })
          : null
      )
    );
    (tryFetchBot as jest.Mock).mockResolvedValue({
      bot_id: 'b9',
      name: 'Old Bot',
      deleted_at: '2026-01-01T00:00:00Z',
    });

    await bootstrap();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedBot');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedBot',
      JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
    );
  });
});

describe('useAuthBootstrap profile selection repair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getSessionMode as jest.Mock).mockResolvedValue({
      isTeenDelegated: false,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: [{ profile_id: 'p1', name: 'Jordan' }],
      count: 1,
    });
    (fetchOwnProfile as jest.Mock).mockResolvedValue(null);
    (tryFetchProfile as jest.Mock).mockResolvedValue(null);
    (fetchBots as jest.Mock).mockResolvedValue({
      results: [{ bot_id: 'b1', name: 'Penelope' }],
      count: 1,
    });
    (tryFetchBot as jest.Mock).mockResolvedValue(null);
  });

  it('keeps a stored profile selection owned by the current account', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedProfile'
          ? JSON.stringify({ profile_id: 'p1', name: 'Jordan' })
          : null
      )
    );

    await bootstrap();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(
      'selectedProfile'
    );
  });

  it('keeps a valid profile that lives beyond the first list page', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedProfile'
          ? JSON.stringify({ profile_id: 'p51', name: 'Late Profile' })
          : null
      )
    );
    (tryFetchProfile as jest.Mock).mockResolvedValue({
      profile_id: 'p51',
      name: 'Late Profile',
      deleted_at: null,
    });

    await bootstrap();

    expect(tryFetchProfile).toHaveBeenCalledWith('p51');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(
      'selectedProfile'
    );
  });

  it('drops a foreign profile selection and reseeds from the live list', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedProfile'
          ? JSON.stringify({ profile_id: 'px', name: 'Other Account' })
          : null
      )
    );
    (tryFetchProfile as jest.Mock).mockResolvedValue('missing');

    await bootstrap();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedProfile');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify({ profile_id: 'p1', name: 'Jordan' })
    );
  });

  it('keeps an unverifiable profile selection when the lookup fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedProfile'
          ? JSON.stringify({ profile_id: 'px', name: 'Maybe Mine' })
          : null
      )
    );
    (tryFetchProfile as jest.Mock).mockResolvedValue(null);

    await bootstrap();

    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(
      'selectedProfile'
    );
  });

  it('keeps the selection when the list fails even if the detail 404s', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === 'selectedProfile'
          ? JSON.stringify({ profile_id: 'px', name: 'Maybe Mine' })
          : null
      )
    );
    (fetchProfiles as jest.Mock).mockResolvedValue(null);
    (tryFetchProfile as jest.Mock).mockResolvedValue('missing');

    await bootstrap();

    // Nothing to reseed from: removing would strand the user with none.
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(
      'selectedProfile'
    );
  });
});
