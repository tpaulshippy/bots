/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { useRouter } from 'expo-router';
import {
  getSelectedProfile,
  getSelectedProfileId,
  setSelectedProfile,
  getSelectedBotId,
  handleUnauthorized,
} from '@/hooks/useSelectedProfile';
import { clearUser } from '@/api/tokens';
import { UnauthorizedError } from '@/api/apiClient';

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(),
}));

type Router = ReturnType<typeof useRouter>;

const PROFILE = { profile_id: 'kid-1', name: 'Kid' };

describe('useSelectedProfile', () => {
  const mockRouter = { replace: jest.fn() } as unknown as Router;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the stored profile id', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify(PROFILE)
    );

    await expect(getSelectedProfileId()).resolves.toBe('kid-1');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('selectedProfile');
  });

  it('returns null when no profile is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await expect(getSelectedProfileId()).resolves.toBeNull();
  });

  it('returns the parsed stored profile', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify(PROFILE)
    );

    await expect(getSelectedProfile()).resolves.toEqual(PROFILE);
  });

  it('returns null profile when nothing is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await expect(getSelectedProfile()).resolves.toBeNull();
  });

  it('stores the profile as JSON', async () => {
    await setSelectedProfile(PROFILE);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify(PROFILE)
    );
  });

  it('removes the stored profile when set to null', async () => {
    await setSelectedProfile(null);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('selectedProfile');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('returns the stored bot id', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ bot_id: 'bot-1' })
    );

    await expect(getSelectedBotId()).resolves.toBe('bot-1');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('selectedBot');
  });

  it('returns null when no bot is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await expect(getSelectedBotId()).resolves.toBeNull();
  });

  it('clears the user and redirects to login on UnauthorizedError', async () => {
    await expect(
      handleUnauthorized(new UnauthorizedError(), mockRouter)
    ).resolves.toBe(true);

    expect(clearUser).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('ignores other errors', async () => {
    await expect(
      handleUnauthorized(new Error('boom'), mockRouter)
    ).resolves.toBe(false);

    expect(clearUser).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
