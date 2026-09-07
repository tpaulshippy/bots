import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTokens } from "@/api/tokens";
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
      // Redirect immediately without blocking on network calls.
      // Screens handle their own data fetching and auth errors.
      router.replace("/chat");
    };

    checkAndRedirect();
  }, [router]);

  return null;
}
