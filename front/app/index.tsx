import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccount } from "@/api/account";
import { getTokens, isTeenDelegatedSession } from "@/api/tokens";
import { isE2ETestMode } from "@/e2e/utils";

export default function ChildHome() {
  const router = useRouter();

  useEffect(() => {
    const checkAndRedirect = async () => {
      const tokens = await getTokens();
      if (!tokens || !tokens.access) {
        router.replace("/login");
        return;
      }
      // If the app was launched by tapping a notification, the root layout
      // navigates to that chat instead; don't clobber it with a redirect.
      // getLastNotificationResponse throws on web (no native module).
      let data: { chat_id?: string } | undefined;
      try {
        const response = Notifications.getLastNotificationResponse();
        data = response?.notification.request.content.data as
          | { chat_id?: string }
          | undefined;
      } catch {
        data = undefined;
      }
      if (data?.chat_id) {
        return;
      }
      // Detox e2e runs may request a specific landing screen via injected
      // AsyncStorage (see front/e2e/01-teen-login.e2e.js).
      if (isE2ETestMode()) {
        const e2eInitialRoute = await AsyncStorage.getItem("e2eInitialRoute");
        if (e2eInitialRoute) {
          router.replace(e2eInitialRoute as never);
          return;
        }
      }
      // First-run gate: accounts that have not finished onboarding go through
      // the wizard. Teen delegated sessions were set up by their parent and
      // skip it. If the account info can't be loaded we fall through to chat,
      // which handles its own data fetching and auth errors.
      try {
        const account = await getAccount();
        if (account && !account.onboardingCompleted) {
          if (!(await isTeenDelegatedSession())) {
            router.replace("/onboarding");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      }
      // Redirect without blocking further on network calls.
      // Screens handle their own data fetching and auth errors.
      router.replace("/chat");
    };

    checkAndRedirect();
  }, [router]);

  return null;
}
