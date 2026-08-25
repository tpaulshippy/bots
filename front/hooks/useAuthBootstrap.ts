import { useCallback, useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { fetchBots } from "@/api/bots";
import { fetchOwnProfile, fetchProfiles } from "@/api/profiles";
import { UnauthorizedError } from "@/api/apiClient";
import { clearUser, getSessionMode, sessionFromQueryParams, setTokens } from "@/api/tokens";

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

  /**
   * Teen-delegated sessions never see the profile picker: fetch only their
   * own redacted profile (the parent list endpoint denies them) and force
   * it as the selection.
   */
  const setDelegatedProfile = useCallback(async () => {
    const mode = await getSessionMode();
    if (!mode.isTeenDelegated || !mode.activeProfileId) return;

    const existing = await AsyncStorage.getItem("selectedProfile");
    if (existing && JSON.parse(existing).profile_id === mode.activeProfileId) {
      return;
    }
    const ownProfile =
      (await fetchOwnProfile()) ?? { profile_id: mode.activeProfileId };
    await AsyncStorage.setItem("selectedProfile", JSON.stringify(ownProfile));
  }, []);

  const initialNavigationChecks = useCallback(async () => {
    try {
      await fetchBots();
      const mode = await getSessionMode();
      if (mode.isTeenDelegated) {
        await setDelegatedProfile();
      } else {
        await setProfile();
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await clearUser();
        router.replace("/login");
      } else {
        console.error("Initialization error:", error);
        Sentry.captureException?.(error);
      }
    }
  }, [router, setDelegatedProfile, setProfile]);

  const getJWTFromLink = useCallback(async (event?: any): Promise<boolean> => {
    const url = event?.url;
    if (!url) return false;

    const { queryParams } = Linking.parse(url);
    const session = sessionFromQueryParams(queryParams);

    if (session) {
      await setTokens(session);
      WebBrowser.dismissBrowser();

      // Lock teen-delegated devices to their claimed profile immediately:
      // no profile picker, ever.
      if (session.isTeenDelegated && session.activeProfileId) {
        const ownProfile =
          (await fetchOwnProfile()) ?? {
            profile_id: session.activeProfileId,
          };
        await AsyncStorage.setItem(
          "selectedProfile",
          JSON.stringify(ownProfile)
        );
      }

      router.replace("/");
      await initialNavigationChecks();
      return true;
    }

    return false;
  }, [initialNavigationChecks, router]);

  useEffect(() => {
    if (loaded) {
      const subscription = Linking.addEventListener("url", getJWTFromLink);

      // Hide splash screen immediately so the UI is never blocked
      SplashScreen.hideAsync().catch(() => {});

      const initialize = async () => {
        const initialUrl = await Linking.getInitialURL();
        const handledInitialUrl = await getJWTFromLink({ url: initialUrl });
        if (!handledInitialUrl) {
          await initialNavigationChecks();
        }
      };

      // Run auth checks in the background without blocking rendering
      void initialize();

      return () => {
        subscription.remove();
      };
    }
  }, [getJWTFromLink, initialNavigationChecks, loaded]);
}
