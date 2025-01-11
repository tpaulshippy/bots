import AsyncStorage from "@react-native-async-storage/async-storage";
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// Keyed by BASE_URL
interface TokenStore {
  [key: string]: TokenData;
}

interface TokenData {
  access: string;
  refresh: string;
}

const getTokensFromStorage = async (): Promise<TokenStore | null> => {
  try {
    const tokens = await AsyncStorage.getItem("tokens");
    if (tokens) {
      const tokensData = JSON.parse(tokens) as TokenStore;
      return tokensData;
    }
    return null;
  } catch (error) {
    console.error("Failed to load the tokens from local storage", error);
    return null;
  }
};

const saveTokensToStorage = async (tokens: TokenStore) => {
  try {
    await AsyncStorage.setItem("tokens", JSON.stringify(tokens));
  } catch (error) {
    console.error("Failed to save the tokens to local storage", error);
  }
};

export const getTokens = async (): Promise<TokenData | null> => {
  try {
    if (BASE_URL === undefined) {
      console.error("BASE_URL is undefined");
      return null;
    }
    const tokensData = await getTokensFromStorage();
    if (tokensData) {
      return tokensData[BASE_URL];
    }
    return null;
  } catch (error) {
    console.error("Failed to get the tokens from local storage", error);
    return null;
  }
};

export const setTokens = async (tokens: TokenData) => {
    try {
        if (BASE_URL === undefined) {
            console.error("BASE_URL is undefined");
            return;
        }
        const tokensData = await getTokensFromStorage();
        const newTokens = { ...tokensData, [BASE_URL]: tokens };
        await saveTokensToStorage(newTokens);
    } catch (error) {
        console.error("Failed to set the tokens in local storage", error);
    }
};