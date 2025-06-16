import AsyncStorage from "@react-native-async-storage/async-storage";

const PIN_STORAGE_KEY = "@user_pin";

export const getCachedPin = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(PIN_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to get cached PIN:", error);
    return null;
  }
};

export const setCachedPin = async (pin: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(PIN_STORAGE_KEY, pin);
  } catch (error) {
    console.error("Failed to cache PIN:", error);
    throw error;
  }
};

export const clearCachedPin = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PIN_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear cached PIN:", error);
    throw error;
  }
};
