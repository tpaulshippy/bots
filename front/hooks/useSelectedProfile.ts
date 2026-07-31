import AsyncStorage from "@react-native-async-storage/async-storage";
import type { useRouter } from "expo-router";

import { UnauthorizedError } from "@/api/apiClient";
import { clearUser } from "@/api/tokens";

type Router = ReturnType<typeof useRouter>;

export const getSelectedProfile = async () => {
  const profileData = await AsyncStorage.getItem("selectedProfile");
  if (profileData) {
    return JSON.parse(profileData);
  }
  return null;
};

export const getSelectedProfileId = async () => {
  const profile = await getSelectedProfile();
  if (profile) {
    return profile.profile_id;
  }
  return null;
};

export const setSelectedProfile = async (profile: unknown) => {
  if (profile) {
    await AsyncStorage.setItem("selectedProfile", JSON.stringify(profile));
  } else {
    await AsyncStorage.removeItem("selectedProfile");
  }
};

export const getSelectedBotId = async () => {
  const botData = await AsyncStorage.getItem("selectedBot");
  if (botData) {
    const bot = JSON.parse(botData);
    return bot.bot_id;
  }
  return null;
};

/**
 * If the error is an UnauthorizedError, clears the user and redirects to
 * login. Returns true when the error was handled.
 */
export const handleUnauthorized = async (
  error: unknown,
  router: Router
): Promise<boolean> => {
  if (error instanceof UnauthorizedError) {
    await clearUser();
    router.replace("/login");
    return true;
  }
  return false;
};
