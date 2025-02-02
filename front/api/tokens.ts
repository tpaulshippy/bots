import AsyncStorage from "@react-native-async-storage/async-storage";
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// Keyed by BASE_URL
interface TokenStore {
  [key: string]: TokenData;
}

export interface TokenData {
  access: string;
  refresh: string;
}

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
    console.error("BASE_URL is undefined");
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
        console.error("BASE_URL is undefined");
        return;
    }
    const tokensData = await getTokensFromStorage();
    const newTokens = { ...tokensData, [BASE_URL]: tokens };
    await saveTokensToStorage(newTokens);
};