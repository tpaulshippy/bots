import { useCallback, useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { fetchBots } from "@/api/bots";
import { fetchProfiles } from "@/api/profiles";
import { UnauthorizedError } from "@/api/apiClient";
import { clearUser, setTokens } from "@/api/tokens";

/**
 * Bootstraps the session once the app has loaded: runs the initial auth
 * check (redirecting to /login when the session is no longer valid),
 * repairs the stored profile selection, and consumes JWT tokens delivered
 * via deep link.
 */
export function useAuthBootstrap(loaded: boolean) {
  const router = useRouter();

  const setProfile = useCallback(async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    const profiles = await fetchProfiles();
    if (profileData) {
      const profile = JSON.parse(profileData);
      const profileExists = profiles?.results.some(
        (p) => p.profile_id === profile.profile_id
      );
      if (!profileExists) {
        await AsyncStorage.removeItem("selectedProfile");
        if (profiles && profiles.count > 0) {
          await AsyncStorage.setItem(
            "selectedProfile",
            JSON.stringify(profiles.results[0])
          );
        }
      }
    }
  }, []);

  const initialNavigationChecks = useCallback(async () => {
    try {
      await fetchBots();
      await setProfile();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await clearUser();
        router.replace("/login");
      } else {
        console.error("Initialization error:", error);
        Sentry.captureException?.(error);
      }
    }
  }, [router, setProfile]);

  const getJWTFromLink = useCallback(async (event?: any) => {
    const url = event?.url;
    if (!url) return;

    const { queryParams } = Linking.parse(url);

    if (queryParams && queryParams.access && queryParams.refresh) {
      const access = queryParams.access as string;
      const refresh = queryParams.refresh as string;
      await setTokens({ access, refresh });
      WebBrowser.dismissBrowser();

      router.replace("/");
      await initialNavigationChecks();
    }
  }, [initialNavigationChecks, router]);

  useEffect(() => {
    if (loaded) {
      const subscription = Linking.addEventListener("url", getJWTFromLink);

      // Hide splash screen immediately so the UI is never blocked
      SplashScreen.hideAsync().catch(() => {});

      // Run auth checks in the background without blocking rendering
      void initialNavigationChecks();

      return () => {
        subscription.remove();
      };
    }
  }, [getJWTFromLink, initialNavigationChecks, loaded]);
}
