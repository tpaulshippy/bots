import {
  clearCachedPin,
  clearParentSession,
  getCachedHasPin,
  getParentSession,
  setCachedHasPin,
  setParentSession,
} from '../../api/pinStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('pinStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearParentSession();
  });

  describe('parent session (in-memory)', () => {
    it('stores and returns a session created from an ISO expiry', () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const session = setParentSession('token-1', expiresAt);

      expect(session.token).toBe('token-1');
      expect(getParentSession()?.token).toBe('token-1');
    });

    it('returns null and clears an expired session', () => {
      const expired = new Date(Date.now() - 1000).toISOString();
      setParentSession('token-2', expired);

      expect(getParentSession()).toBeNull();
      // Still null on subsequent reads.
      expect(getParentSession()).toBeNull();
    });

    it('accepts epoch-millisecond expiries', () => {
      setParentSession('token-3', Date.now() + 60_000);
      expect(getParentSession()?.token).toBe('token-3');
    });

    it('is cleared explicitly by clearParentSession', () => {
      setParentSession('token-4', Date.now() + 60_000);
      clearParentSession();

      expect(getParentSession()).toBeNull();
    });
  });

  describe('hasPin cache', () => {
    it('persists true and false flags via AsyncStorage', async () => {
      await setCachedHasPin(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@has_pin', 'true');

      (AsyncStorage.getItem as unknown as jest.Mock).mockResolvedValueOnce('true');
      await expect(getCachedHasPin()).resolves.toBe(true);

      (AsyncStorage.getItem as unknown as jest.Mock).mockResolvedValueOnce(null);
      await expect(getCachedHasPin()).resolves.toBe(false);
    });
  });

  describe('legacy plaintext PIN cache', () => {
    it('only ever removes the legacy @user_pin key', async () => {
      await clearCachedPin();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@user_pin');
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        '@user_pin',
        expect.anything()
      );
    });
  });
});
