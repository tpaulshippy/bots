import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { getTokens } from "@/api/tokens";

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
      // Redirect immediately without blocking on network calls.
      // Screens handle their own data fetching and auth errors.
      router.replace("/chat");
    };

    checkAndRedirect();
  }, [router]);

  return null;
}
