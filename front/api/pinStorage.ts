import AsyncStorage from "@react-native-async-storage/async-storage";

// Legacy key where the plaintext PIN used to be cached. It is only ever
// removed now — never written (roadmap doc 02: stop caching the real PIN).
const LEGACY_PIN_STORAGE_KEY = "@user_pin";
const HAS_PIN_STORAGE_KEY = "@has_pin";

/**
 * Short-lived parent capability issued by POST /auth/reauthenticate.
 * Kept in memory only (never AsyncStorage): losing it on app restart just
 * means the parent re-enters their PIN.
 */
export interface ParentSession {
  token: string;
  /** Epoch milliseconds after which the parent session must be renewed. */
  expiresAt: number;
}

let parentSession: ParentSession | null = null;

/** Remove any legacy plaintext PIN left by older app versions. */
export const clearCachedPin = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LEGACY_PIN_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear cached PIN:", error);
  }
};

export const getCachedHasPin = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(HAS_PIN_STORAGE_KEY)) === "true";
  } catch (error) {
    console.error("Failed to get hasPin:", error);
    return false;
  }
};

export const setCachedHasPin = async (hasPin: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(HAS_PIN_STORAGE_KEY, hasPin ? "true" : "false");
  } catch (error) {
    console.error("Failed to cache hasPin:", error);
  }
};

export const getParentSession = (): ParentSession | null => {
  if (!parentSession) {
    return null;
  }
  if (Date.now() >= parentSession.expiresAt) {
    parentSession = null;
    return null;
  }
  return parentSession;
};

export const setParentSession = (
  token: string,
  expiresAt: string | number | Date
): ParentSession => {
  let expiry: number;
  if (typeof expiresAt === "number") {
    expiry = expiresAt;
  } else {
    expiry = new Date(expiresAt).getTime();
  }

  parentSession = { token, expiresAt: expiry };
  return parentSession;
};

export const clearParentSession = (): void => {
  parentSession = null;
};
