import { useCallback, useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { fetchBots, tryFetchBot } from "@/api/bots";
import type { Bot } from "@/api/bots";
import { fetchOwnProfile, fetchProfiles, tryFetchProfile } from "@/api/profiles";
import type { PaginatedResponse } from "@/api/request";
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
    // Fetch first (as before): callers rely on the list being consulted
    // even when nothing is stored.
    const profiles = await fetchProfiles().catch(() => null);
    if (!profileData) {
      return;
    }
    let profile: { profile_id?: string } | null = null;
    try {
      profile = JSON.parse(profileData);
    } catch {
      profile = null;
    }
    const storedId =
      profile && typeof profile.profile_id === "string"
        ? profile.profile_id
        : null;
    if (storedId && profiles?.results.some((p) => p.profile_id === storedId)) {
      return;
    }
    if (storedId) {
      // Page one is not the whole account: resolve through the detail
      // endpoint before treating the id as foreign. Auth errors propagate
      // to the login redirect; anything unverifiable keeps the selection.
      const lookup = await tryFetchProfile(storedId);
      if (lookup && lookup !== "missing" && !lookup.deleted_at) {
        return;
      }
      if (lookup === null) {
        return;
      }
    }
    await AsyncStorage.removeItem("selectedProfile");
    if (profiles && profiles.count > 0) {
      await AsyncStorage.setItem(
        "selectedProfile",
        JSON.stringify(profiles.results[0])
      );
    }
  }, []);

  /**
   * Same ownership repair as setProfile, for the selected bot: a stored
   * selection from another account (or a deleted bot) is dropped and
   * re-seeded from the live list. Two safeguards: the stored id is resolved
   * with a failure-distinguishing single-bot lookup before giving up (page
   * one is not the whole account, and the detail endpoint can return
   * soft-deleted rows), and anything unverifiable — failed fetches,
   * offline, denied — keeps the stored selection.
   */
  const setBot = useCallback(
    async (prefetchedBots?: PaginatedResponse<Bot> | null) => {
      const botData = await AsyncStorage.getItem("selectedBot");
      if (!botData) {
        return;
      }
      let bot: { bot_id?: string } | null = null;
      try {
        bot = JSON.parse(botData);
      } catch {
        bot = null;
      }
      const storedId =
        bot && typeof bot.bot_id === "string" ? bot.bot_id : null;
      const bots =
        prefetchedBots === undefined
          ? await fetchBots().catch(() => null)
          : prefetchedBots;
      if (storedId && bots?.results.some((b) => b.bot_id === storedId)) {
        return;
      }
      // Only a confirmed absence clears the selection: 'missing' on 404 or
      // a soft-deleted detail row (both with a loaded list to reseed from).
      let confirmedGone = !storedId;
      if (storedId) {
        // No catch: tryFetchBot maps every non-auth failure to null and
        // only auth errors throw, which must reach the login redirect in
        // initialNavigationChecks rather than look like an unverifiable
        // selection.
        const lookup = await tryFetchBot(storedId);
        confirmedGone =
          !!bots &&
          (lookup === "missing" || (!!lookup && !!lookup.deleted_at));
      }
      if (!confirmedGone) {
        return;
      }
      await AsyncStorage.removeItem("selectedBot");
      if (bots && bots.count > 0) {
        await AsyncStorage.setItem(
          "selectedBot",
          JSON.stringify(bots.results[0])
        );
      }
    },
    []
  );

  /**
   * Teen-delegated sessions never see the profile picker: fetch only their
   * own redacted profile (the parent list endpoint denies them) and force
   * it as the selection.
   */
  const setDelegatedProfile = useCallback(async () => {
    const mode = await getSessionMode();
    if (!mode.isTeenDelegated || !mode.activeProfileId) return;

    const existing = await AsyncStorage.getItem("selectedProfile");
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { profile_id?: unknown };
        if (parsed?.profile_id === mode.activeProfileId) {
          return;
        }
      } catch {
        // Corrupted selection: fall through, refetch, and overwrite below.
        await AsyncStorage.removeItem("selectedProfile");
      }
    }
    const ownProfile =
      (await fetchOwnProfile()) ?? { profile_id: mode.activeProfileId };
    await AsyncStorage.setItem("selectedProfile", JSON.stringify(ownProfile));
  }, []);

  const initialNavigationChecks = useCallback(async () => {
    try {
      // Doubles as the logged-out probe (401 throws → redirect below);
      // the result is reused so setBot doesn't fetch the list twice.
      const bots = await fetchBots();
      const mode = await getSessionMode();
      if (mode.isTeenDelegated) {
        await setDelegatedProfile();
        await setBot(bots);
      } else {
        await setProfile();
        await setBot(bots);
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
  }, [router, setBot, setDelegatedProfile, setProfile]);

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
