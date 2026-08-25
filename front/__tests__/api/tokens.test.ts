// tokens.ts captures BASE_URL at module evaluation time, so it must be set
// before the module is required. Static imports are hoisted by babel, so
// this module is loaded with require() below instead.
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://tokens-test';

import AsyncStorage from '@react-native-async-storage/async-storage';

const {
  clearUser,
  getSessionMode,
  PARENT_SESSION_MODE,
  sessionFromQueryParams,
  setTokens,
} = require('../../api/tokens') as typeof import('../../api/tokens');

type TokenData = import('../../api/tokens').TokenData;

const BASE_URL = 'http://tokens-test';

describe('tokens session helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_BASE_URL = BASE_URL;
  });

  describe('sessionFromQueryParams', () => {
    it('returns null when access or refresh are missing', () => {
      expect(sessionFromQueryParams(undefined)).toBeNull();
      expect(sessionFromQueryParams({})).toBeNull();
      expect(sessionFromQueryParams({ access: 'a' })).toBeNull();
      expect(
        sessionFromQueryParams({ access: 'a', refresh: 'r' })
      ).not.toBeNull();
    });

    it('parses teen delegation flags from the login query', () => {
      const session = sessionFromQueryParams({
        access: 'a-token',
        refresh: 'r-token',
        is_teen_delegated: 'true',
        active_profile_id: 'profile-1',
      });

      expect(session).toEqual({
        access: 'a-token',
        refresh: 'r-token',
        isTeenDelegated: true,
        activeProfileId: 'profile-1',
      });
    });

    it('defaults to a parent session when flags are absent or false', () => {
      const absent = sessionFromQueryParams({ access: 'a', refresh: 'r' });
      expect(absent?.isTeenDelegated).toBe(false);
      expect(absent?.activeProfileId).toBeNull();

      const explicit = sessionFromQueryParams({
        access: 'a',
        refresh: 'r',
        is_teen_delegated: 'false',
        active_profile_id: 'ignored',
      });
      expect(explicit?.isTeenDelegated).toBe(false);
      // A profile id without delegation is not stored.
      expect(explicit?.activeProfileId).toBeNull();
    });
  });

  describe('getSessionMode', () => {
    it('returns parent mode when no tokens are stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await expect(getSessionMode()).resolves.toEqual(PARENT_SESSION_MODE);
    });

    it('returns the delegated mode with active profile for teen claims', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({
          [BASE_URL]: {
            access: 'a',
            refresh: 'r',
            isTeenDelegated: true,
            activeProfileId: 'profile-9',
          } satisfies TokenData,
        })
      );

      await expect(getSessionMode()).resolves.toEqual({
        isTeenDelegated: true,
        activeProfileId: 'profile-9',
      });
    });

    it('treats legacy tokens without claims as a parent session', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({
          [BASE_URL]: { access: 'a', refresh: 'r' },
        })
      );

      await expect(getSessionMode()).resolves.toEqual(PARENT_SESSION_MODE);
    });
  });

  describe('clearUser', () => {
    it('resets delegated claims along with the token pair', async () => {
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        key === 'tokens'
          ? Promise.resolve(
              JSON.stringify({
                [BASE_URL]: {
                  access: 'a',
                  refresh: 'r',
                  isTeenDelegated: true,
                  activeProfileId: 'p1',
                },
              })
            )
          : Promise.resolve(null)
      );

      await clearUser();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tokens',
        JSON.stringify({
          [BASE_URL]: {
            access: '',
            refresh: '',
            isTeenDelegated: false,
            activeProfileId: null,
          },
        })
      );
    });
  });

  describe('setTokens', () => {
    it('stores claims keyed by base URL', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await setTokens({
        access: 'a',
        refresh: 'r',
        isTeenDelegated: true,
        activeProfileId: 'p2',
      });

      const raw = (AsyncStorage.setItem as jest.Mock).mock.calls[0][1];
      expect(JSON.parse(raw)).toEqual({
        [BASE_URL]: {
          access: 'a',
          refresh: 'r',
          isTeenDelegated: true,
          activeProfileId: 'p2',
        },
      });
    });
  });
});
