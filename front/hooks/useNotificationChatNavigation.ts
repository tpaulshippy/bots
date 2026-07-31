import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { fetchChat } from "@/api/chats";
import { handleUnauthorized, setSelectedProfile } from "@/hooks/useSelectedProfile";

/**
 * Navigates to the chat a notification is about and switches to the
 * profile (kid) that chat belongs to.
 *
 * Handles both taps while the app is running (via listener) and taps
 * that cold-start the app (via getLastNotificationResponse, which is the
 * only reliable source for the launch response).
 */
export function useNotificationChatNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  // Guards against handling the same response twice: the launch response can
  // be delivered both to the listener and via getLastNotificationResponse.
  const handledResponseId = useRef<string | null>(null);

  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { chat_id?: string }
        | undefined;
      if (!response || !data?.chat_id) {
        return;
      }
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) {
        return;
      }
      handledResponseId.current = responseId;

      try {
        const chat = await fetchChat(data.chat_id);
        if (!chat) {
          return;
        }
        // Switch profile before navigating so the chat screen and any
        // subsequent new chat use the kid's profile.
        if (chat.profile?.profile_id) {
          await setSelectedProfile(chat.profile);
        }
        const route = {
          pathname: "/chat" as const,
          params: { chatId: chat.chat_id, title: chat.bot?.name || chat.title },
        };
        if (pathname === "/chat") {
          router.replace(route);
        } else {
          router.push(route);
        }
      } catch (error) {
        if (!(await handleUnauthorized(error, router))) {
          Sentry.captureException(error);
        }
      }
    },
    [pathname, router]
  );

  useEffect(() => {
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    // Cold start: the app was launched by tapping a notification.
    if (Platform.OS !== "web") {
      handleResponse(Notifications.getLastNotificationResponse());
    }
    return () => subscription.remove();
  }, [handleResponse]);
}
