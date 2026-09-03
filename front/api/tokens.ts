import * as Sentry from "@sentry/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// Keyed by BASE_URL
interface TokenStore {
  [key: string]: TokenData;
}

export interface TokenData {
  access: string;
  refresh: string;
  // Present on teen-delegated sessions: this device is locked to one profile.
  isTeenDelegated?: boolean;
  activeProfileId?: string | null;
}

export interface SessionMode {
  isTeenDelegated: boolean;
  activeProfileId: string | null;
}

export const PARENT_SESSION_MODE: SessionMode = {
  isTeenDelegated: false,
  activeProfileId: null,
};

const getTokensFromStorage = async (): Promise<TokenStore | null> => {
  const tokens = await AsyncStorage.getItem("tokens");
  if (tokens) {
    const tokensData = JSON.parse(tokens) as TokenStore;
    return tokensData;
  }
  return null;
};

const saveTokensToStorage = async (tokens: TokenStore) => {
  await AsyncStorage.setItem("tokens", JSON.stringify(tokens));
};

export const getTokens = async (): Promise<TokenData | null> => {
  if (BASE_URL === undefined) {
    Sentry.captureMessage("BASE_URL is undefined");
    return null;
  }
  const tokensData = await getTokensFromStorage();
  if (tokensData) {
    return tokensData[BASE_URL];
  }
  return null;
};

export const setTokens = async (tokens: TokenData) => {
    if (BASE_URL === undefined) {
        Sentry.captureMessage("BASE_URL is undefined");
        return;
    }
    const tokensData = await getTokensFromStorage();
    const newTokens = { ...tokensData, [BASE_URL]: tokens };
    await saveTokensToStorage(newTokens);
};

/**
 * Session mode derived from the stored JWT claims. Parent sessions default
 * to { isTeenDelegated: false } when the claims are absent.
 */
export const getSessionMode = async (): Promise<SessionMode> => {
  const tokens = await getTokens();
  if (!tokens) {
    return PARENT_SESSION_MODE;
  }
  return {
    isTeenDelegated: tokens.isTeenDelegated === true,
    activeProfileId:
      tokens.isTeenDelegated === true ? tokens.activeProfileId ?? null : null,
  };
};

/**
 * Map login deep-link / web query params onto stored session data.
 * Returns null when the params do not carry a token pair.
 */
export const sessionFromQueryParams = (
  queryParams: Record<string, unknown> | undefined | null
): TokenData | null => {
  const access = queryParams?.access as string | undefined;
  const refresh = queryParams?.refresh as string | undefined;
  if (!access || !refresh) {
    return null;
  }
  const isTeenDelegated =
    String(queryParams?.is_teen_delegated ?? "false").toLowerCase() === "true";
  const activeProfileId = (queryParams?.active_profile_id as string) || null;
  return {
    access,
    refresh,
    isTeenDelegated,
    activeProfileId: isTeenDelegated ? activeProfileId : null,
  };
};

export const clearUser = async () => {
  const tokens = await getTokens();
  if (tokens && (tokens.access || tokens.refresh || tokens.isTeenDelegated)) {
    await setTokens({
      access: "",
      refresh: "",
      isTeenDelegated: false,
      activeProfileId: null,
    });
  }
};
