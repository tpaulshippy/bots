import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { fetchChat } from "@/api/chats";
import { fetchProfiles } from "@/api/profiles";
import { handleUnauthorized, setSelectedProfile, getSelectedProfileId } from "@/hooks/useSelectedProfile";

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
        | { chat_id?: string; target?: string; deck_id?: string; profile_id?: string }
        | undefined;
      if (!response || (!data?.chat_id && !data?.target)) {
        return;
      }
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) {
        return;
      }
      handledResponseId.current = responseId;

      // Digest / parent-review pushes open the parent Activity area instead
      // of the kid chat; kid message pushes keep opening the kid chat so a
      // parent on the shared device can jump straight in.
      if (data.target === "parent_activity") {
        const route = data.chat_id
          ? ({
              pathname: "/parent/activityChat" as const,
              params: { chatId: data.chat_id },
            } as const)
          : ({ pathname: "/parent/activity" } as const);
        router.push(route);
        return;
      }

      // Study reminders open the due study session directly when the push
      // names a single deck, otherwise the deck list (due badges show where).
      // When every counted deck belongs to one profile the payload names it:
      // switch selection first, because the deck list (and study queue) are
      // scoped to the selected profile — without the switch the tap could
      // land on a list omitting the cards it counted. Teen sessions locked
      // elsewhere are unaffected: setSelectedProfile refuses cross-profile
      // switches, and the downstream scoping falls back to their own lists.
      if (data.target === "study_due") {
        if (data.profile_id) {
          try {
            const selected = await getSelectedProfileId().catch(() => null);
            if (selected !== data.profile_id) {
              const profiles = await fetchProfiles().catch(() => null);
              const match = profiles?.results?.find(
                (p) => p.profile_id === data.profile_id
              );
              if (match) {
                await setSelectedProfile(match);
              }
            }
          } catch (error) {
            // A failed switch must never block the reminder: navigate to
            // the current selection's lists as before.
            Sentry.captureException(error);
          }
        }
        if (data.deck_id) {
          router.push({
            pathname: "/flashcards/study",
            params: { deckId: data.deck_id, mode: "due", source: "reminder" },
          });
        } else {
          router.push({ pathname: "/flashcards" });
        }
        return;
      }

      if (!data.chat_id) {
        return;
      }

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
      const launchResponse = Notifications.getLastNotificationResponse();
      void (async () => {
        try {
          await handleResponse(launchResponse);
        } finally {
          // Expo keeps returning the last response until it is cleared: a
          // handled tap must never re-fire on a later launch or later visit
          // to /. Clear whenever a launch response existed, even one the
          // handler ignored. The index route reads the same response on
          // mount, and child effects run before this parent effect, so it
          // has already consumed it by the time we clear.
          if (launchResponse) {
            // Guarded: older native runtimes (OTA skew) may lack it.
            const clear = Notifications.clearLastNotificationResponseAsync;
            if (typeof clear === "function") {
              await clear().catch(() => undefined);
            }
          }
        }
      })();
    }
    return () => subscription.remove();
  }, [handleResponse]);
}
