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
    notifySessionModeChanged();
};

type SessionModeListener = (mode: SessionMode) => void;

const sessionModeListeners = new Set<SessionModeListener>();

/**
 * Subscribe to session-mode changes (login/logout/teen delegation switch).
 * useSessionMode uses this so long-mounted UI (drawer, route guard) updates
 * without an app restart. Returns an unsubscribe function.
 */
export const subscribeToSessionMode = (
  listener: SessionModeListener
): (() => void) => {
  sessionModeListeners.add(listener);
  return () => {
    sessionModeListeners.delete(listener);
  };
};

const notifySessionModeChanged = () => {
  void getSessionMode()
    .then((mode) => {
      sessionModeListeners.forEach((listener) => {
        try {
          listener(mode);
        } catch {
          // A failing subscriber must not break token storage.
        }
      });
    })
    .catch(() => {});
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
  // expo-linking may return string[] for repeated query params; take the
  // first entry so we never store a joined "a,b" token value.
  const firstString = (value: unknown): string | undefined => {
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" && first ? first : undefined;
  };
  const access = firstString(queryParams?.access);
  const refresh = firstString(queryParams?.refresh);
  if (!access || !refresh) {
    return null;
  }
  const isTeenDelegated =
    (firstString(queryParams?.is_teen_delegated) ?? "false").toLowerCase() ===
    "true";
  const activeProfileId = firstString(queryParams?.active_profile_id) ?? null;
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
  // Selections are account-scoped: a logout, account deletion, or expired
  // session must not leak the previous account's rows into the next login
  // on a shared device (the bootstrap repair reseeds from live data).
  await AsyncStorage.removeItem("selectedProfile");
  await AsyncStorage.removeItem("selectedBot");
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  try {
    const normalized = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    if (typeof atob !== "function") {
      return null;
    }
    const binary = atob(padded);
    const json = decodeURIComponent(
      binary
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Teen delegated sessions (parent tokens minted for a teen profile) skip
 * onboarding and see a display-only profile switcher. Consult the stored
 * session flag first (the source of truth used by getSessionMode), falling
 * back to the JWT claim for sessions stored before the flag existed.
 */
export const isTeenDelegatedSession = async (): Promise<boolean> => {
  const tokens = await getTokens();
  if (!tokens?.access) {
    return false;
  }
  if (tokens.isTeenDelegated === true) {
    return true;
  }
  const payload = decodeJwtPayload(tokens.access);
  return payload?.is_teen_delegated === true;
};
