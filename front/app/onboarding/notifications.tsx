import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import {
  bootstrapOnboarding,
  completeOnboarding,
} from "@/api/account";
import { fieldMessage } from "@/api/fieldErrors";
import { fetchBots } from "@/api/bots";
import {
  fetchDevice,
  fetchDeviceByToken,
  getDeviceIdFromStorage,
  setDeviceIdInStorage,
  upsertDevice,
} from "@/api/devices";
import { fetchProfiles } from "@/api/profiles";
import { setSelectedProfile } from "@/hooks/useSelectedProfile";
import { registerForPushNotificationsAsync } from "../parent/notifications";
import { WizardStep } from "./WizardStep";

export default function OnboardingNotifications() {
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileName?: string;
    studentEmail?: string;
    botName?: string;
    templateName?: string;
    systemPrompt?: string;
    color?: string;
    icon?: string;
    pin?: string;
    review?: string;
  }>();
  // Review mode (?review=true): re-walking the wizard to verify the current
  // setup. Earlier steps pre-fill from the API; finishing saves normally —
  // bootstrap is idempotent (renames in place, never duplicates), so leaving
  // everything unchanged changes nothing.
  const isReview = local.review === "true";

  // Same per-device flags as Settings → Notifications (PR 46): digest-only
  // suppresses the two immediate pushes, mirroring the settings screen.
  const [notifyOnNewChat, setNotifyOnNewChat] = useState(false);
  const [notifyOnNewMessage, setNotifyOnNewMessage] = useState(false);
  const [notifyDigestOnly, setNotifyDigestOnly] = useState(false);
  const [notifyStudyDue, setNotifyStudyDue] = useState(false);
  const [saving, setSaving] = useState(false);
  // Field error from the last failed save (e.g. taken student email), shown
  // inline so the user can go back and fix it instead of losing the wizard.
  const [saveError, setSaveError] = useState<string | null>(null);

  // Review mode: pre-fill with this device's current notification settings
  // so re-walking the wizard shows what's set (same source as Settings →
  // Notifications). First-run stays all-off.
  useEffect(() => {
    if (!isReview) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const deviceId = await getDeviceIdFromStorage().catch(() => null);
        if (!deviceId) {
          return;
        }
        const current = await fetchDevice(deviceId).catch(() => null);
        if (current && active) {
          setNotifyOnNewChat(current.notify_on_new_chat);
          setNotifyOnNewMessage(current.notify_on_new_message);
          setNotifyDigestOnly(current.notify_digest_only);
          setNotifyStudyDue(current.notify_study_due ?? false);
        }
      } catch {
        // Prefill is best-effort; the wizard still works all-off.
      }
    })();
    return () => {
      active = false;
    };
  }, [isReview]);

  // X gets out without saving: review mode returns to Settings, first-run
  // drops to chat (which re-gates to the wizard if nothing exists yet).
  const exitWizard = () => {
    const target = isReview ? "/parent/settings" : "/chat";
    const r = router as unknown as { dismissTo?: (href: string) => void };
    if (typeof r.dismissTo === "function") {
      try {
        r.dismissTo(target);
        return;
      } catch {
        // Fall through to replace.
      }
    }
    router.replace(target as never);
  };

  // Persist the chosen flags to this device. Never blocks finishing: push
  // registration throws on simulators/web and offline upserts return null.
  const persistNotificationChoices = async () => {
    if (
      !notifyOnNewChat &&
      !notifyOnNewMessage &&
      !notifyDigestOnly &&
      !notifyStudyDue
    ) {
      return;
    }
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        return;
      }
      const existing = await fetchDeviceByToken(token);
      const saved = await upsertDevice({
        ...(existing ?? {
          id: -1,
          device_id: "",
          notification_token: token,
          deleted_at: null,
        }),
        notification_token: token,
        notify_on_new_chat: notifyOnNewChat,
        notify_on_new_message: notifyOnNewMessage,
        notify_digest_only: notifyDigestOnly,
        notify_study_due: notifyStudyDue,
      });
      if (saved) {
        await setDeviceIdInStorage(saved.device_id);
      }
    } catch (error) {
      Sentry.captureException?.(error);
    }
  };

  const finish = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await persistNotificationChoices();
      const response = await bootstrapOnboarding({
        profileName: local.profileName ?? "",
        ...(local.studentEmail ? { studentEmail: local.studentEmail } : {}),
        botName: local.botName || undefined,
        templateName: local.templateName || undefined,
        systemPrompt: local.systemPrompt || undefined,
        color: local.color || undefined,
        icon: local.icon || undefined,
        ...(local.pin ? { pin: local.pin } : {}),
      });

      if (!response || !response.ok) {
        // The server rejected the wizard's choices (e.g. the Step 2 email
        // is already used by another profile). Nothing was saved — stay on
        // this step and say so, pointing back at Step 2 where the email
        // lives. The stack keeps the earlier steps' inputs intact.
        setSaving(false);
        const fieldError = response
          ? fieldMessage(response.data, "studentEmail") ??
            fieldMessage(response.data, "profileName")
          : null;
        if (fieldError) {
          setSaveError(
            `${fieldError} Use the back arrow to fix it in Step 2 — your other choices are kept.`
          );
        } else {
          Sentry.captureException?.(
            new Error(
              `Onboarding bootstrap failed (${response?.status ?? "offline"})`
            )
          );
          Alert.alert(
            "Something went wrong",
            "We couldn't save your setup. Please try again."
          );
        }
        return;
      }
      // 2xx carries the success shape; the union type keeps the 400
      // field-error body honest, so narrow to string ids before matching.
      const result = response.data;
      const profileId =
        typeof result?.profileId === "string" ? result.profileId : undefined;
      const botId =
        typeof result?.botId === "string" ? result.botId : undefined;

      // Select exactly the renamed default profile and first bot so the very
      // first chat needs no further setup (fixes "Please select a profile
      // first"). Listings are name-ordered, so match by id when we have one.
      const profiles = await fetchProfiles();
      const profilesList = profiles?.results ?? [];
      const profile =
        (profileId &&
          profilesList.find((p) => p.profile_id === profileId)) ||
        profilesList[0];
      if (profile) {
        await setSelectedProfile(profile);
      }
      const bots = await fetchBots();
      const botsList = bots?.results ?? [];
      const bot =
        (botId && botsList.find((b) => b.bot_id === botId)) ||
        botsList[0];
      if (bot) {
        await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
      }

      await completeOnboarding();

      router.replace("/chat");
    } catch (error) {
      Sentry.captureException?.(error);
      setSaving(false);
      Alert.alert(
        "Something went wrong",
        "We couldn't save your setup. Please try again."
      );
    }
  };

  return (
    <WizardStep
      step={5}
      title="Stay in the loop"
      subtitle="Choose how you hear about your student's chats."
      onBack={saving ? undefined : () => router.back()}
      onClose={saving ? undefined : exitWizard}
      review={isReview}
    >
      <ThemedView style={styles.notificationsRow}>
        <ThemedText style={styles.notificationsLabel}>
          Notify me when my student starts a chat
        </ThemedText>
        <Switch
          testID="onboarding-notifications-switch"
          value={notifyOnNewChat}
          disabled={notifyDigestOnly}
          onValueChange={setNotifyOnNewChat}
        />
      </ThemedView>
      <ThemedView style={styles.notificationsRow}>
        <ThemedText style={styles.notificationsLabel}>
          Notify me on each message
        </ThemedText>
        <Switch
          testID="onboarding-notify-message-switch"
          value={notifyOnNewMessage}
          disabled={notifyDigestOnly}
          onValueChange={setNotifyOnNewMessage}
        />
      </ThemedView>
      <ThemedView style={styles.notificationsRow}>
        <View style={styles.digestLabelContainer}>
          <ThemedText style={styles.notificationsLabel}>
            Daily digest only
          </ThemedText>
          <ThemedText style={styles.digestHint}>
            One summary a day instead of instant pushes
          </ThemedText>
        </View>
        <Switch
          testID="onboarding-notify-digest-switch"
          value={notifyDigestOnly}
          onValueChange={setNotifyDigestOnly}
        />
      </ThemedView>
      <ThemedView style={styles.notificationsRow}>
        <View style={styles.digestLabelContainer}>
          <ThemedText style={styles.notificationsLabel}>
            Remind me when flashcards are due
          </ThemedText>
          <ThemedText style={styles.digestHint}>
            A nudge when cards are ready to review
          </ThemedText>
        </View>
        <Switch
          testID="onboarding-notify-study-switch"
          value={notifyStudyDue}
          disabled={notifyDigestOnly}
          onValueChange={setNotifyStudyDue}
        />
      </ThemedView>
      <ThemedText style={styles.optionalNote}>
        Optional — you can change these anytime in Settings → Notifications.
      </ThemedText>
      {saveError ? (
        <ThemedText testID="onboarding-save-error" style={styles.saveError}>
          {saveError}
        </ThemedText>
      ) : null}
      {saving ? (
        <ActivityIndicator style={styles.saving} />
      ) : (
        <ThemedButton
          testID="onboarding-finish"
          style={styles.cta}
          onPress={finish}
        >
          <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
            Finish
          </ThemedText>
        </ThemedButton>
      )}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  saveError: {
    fontSize: 14,
    color: "#E63946",
    textAlign: "center",
    marginTop: 12,
  },
  notificationsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    padding: 10,
    marginTop: 20,
  },
  notificationsLabel: {
    flex: 1,
    fontSize: 15,
    marginRight: 10,
  },
  digestLabelContainer: {
    flex: 1,
    flexDirection: "column",
    marginRight: 10,
  },
  digestHint: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  optionalNote: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 6,
  },
  saving: {
    marginTop: "auto",
    marginBottom: 24,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: "auto",
    marginBottom: 8,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
