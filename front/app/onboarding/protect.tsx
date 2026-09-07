import { useState } from "react";
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
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedView } from "@/components/ThemedView";
import {
  bootstrapOnboarding,
  completeOnboarding,
} from "@/api/account";
import { fetchBots } from "@/api/bots";
import {
  fetchDeviceByToken,
  setDeviceIdInStorage,
  upsertDevice,
} from "@/api/devices";
import { fetchProfiles } from "@/api/profiles";
import { setSelectedProfile } from "@/hooks/useSelectedProfile";
import { registerForPushNotificationsAsync } from "../parent/notifications";
import { WizardStep } from "./WizardStep";

const PIN_PATTERN = /^\d{4,8}$/;

export default function OnboardingProtect() {
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileName?: string;
    studentEmail?: string;
    botName?: string;
    templateName?: string;
    systemPrompt?: string;
    color?: string;
    icon?: string;
  }>();

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  // Same per-device flags as Settings → Notifications (PR 46): digest-only
  // suppresses the two immediate pushes, mirroring the settings screen.
  const [notifyOnNewChat, setNotifyOnNewChat] = useState(false);
  const [notifyOnNewMessage, setNotifyOnNewMessage] = useState(false);
  const [notifyDigestOnly, setNotifyDigestOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  // Persist the chosen flags to this device. Never blocks finishing: push
  // registration throws on simulators/web and offline upserts return null.
  const persistNotificationChoices = async () => {
    if (!notifyOnNewChat && !notifyOnNewMessage && !notifyDigestOnly) {
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
      });
      if (saved) {
        await setDeviceIdInStorage(saved.device_id);
      }
    } catch (error) {
      Sentry.captureException?.(error);
    }
  };

  // PIN is optional (PIN-less accounts are supported): leaving both fields
  // empty finishes without a PIN. A half-filled PIN must match and be valid.
  const pinEmpty = pin.length === 0 && pinConfirm.length === 0;
  const pinValid = PIN_PATTERN.test(pin) && pin === pinConfirm;
  const pinError =
    !pinEmpty && !pinValid
      ? !PIN_PATTERN.test(pin) && pin.length > 0
        ? "PIN must be 4 to 8 digits."
        : "PINs don't match yet."
      : null;
  const canFinish = pinEmpty || pinValid;

  const finish = async () => {
    if (!canFinish || saving) {
      return;
    }
    setSaving(true);
    try {
      await persistNotificationChoices();
      const result = await bootstrapOnboarding({
        profileName: local.profileName ?? "",
        ...(local.studentEmail ? { studentEmail: local.studentEmail } : {}),
        botName: local.botName || undefined,
        templateName: local.templateName || undefined,
        systemPrompt: local.systemPrompt || undefined,
        color: local.color || undefined,
        icon: local.icon || undefined,
        ...(pinValid ? { pin } : {}),
      });

      // Select exactly the renamed default profile and first bot so the very
      // first chat needs no further setup (fixes "Please select a profile
      // first"). Listings are name-ordered, so match by id when we have one.
      const profiles = await fetchProfiles();
      const profilesList = profiles?.results ?? [];
      const profile =
        (result?.profileId &&
          profilesList.find((p) => p.profile_id === result.profileId)) ||
        profilesList[0];
      if (profile) {
        await setSelectedProfile(profile);
      }
      const bots = await fetchBots();
      const botsList = bots?.results ?? [];
      const bot =
        (result?.botId && botsList.find((b) => b.bot_id === result.botId)) ||
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
      step={4}
      title="Keep settings parent-only"
      subtitle="Optional — skip to leave parent controls unprotected."
      onBack={saving ? undefined : () => router.back()}
    >
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Create PIN (optional)</ThemedText>
        <ThemedTextInput
          testID="onboarding-pin-input"
          keyboardType="numeric"
          secureTextEntry
          value={pin}
          onChangeText={setPin}
          placeholder="4–8 digits"
          maxLength={8}
          style={styles.input}
        />
      </View>
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>Confirm PIN</ThemedText>
        <ThemedTextInput
          testID="onboarding-pin-confirm"
          keyboardType="numeric"
          secureTextEntry
          value={pinConfirm}
          onChangeText={setPinConfirm}
          placeholder="Re-enter PIN"
          maxLength={8}
          style={[styles.input, pinError && styles.missing]}
        />
        {pinError ? (
          <ThemedText style={styles.hint}>{pinError}</ThemedText>
        ) : pinEmpty ? (
          <ThemedText style={styles.hint} testID="onboarding-pinless-hint">
            No PIN means anyone with this device can open parent settings.
            You can add a PIN anytime in Settings → Set PIN.
          </ThemedText>
        ) : null}
      </View>
      <ThemedView style={styles.notificationsRow}>
        <ThemedText style={styles.notificationsLabel}>
          Notify me when my kid starts a chat
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
      <ThemedText style={styles.optionalNote}>
        Optional — you can change these anytime in Settings → Notifications.
      </ThemedText>
      {saving ? (
        <ActivityIndicator style={styles.saving} />
      ) : (
        <ThemedButton
          testID="onboarding-finish"
          style={[styles.cta, !canFinish && styles.ctaDisabled]}
          disabled={!canFinish}
          onPress={finish}
        >
          <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
            {pinEmpty ? "Finish without a PIN" : "Finish"}
          </ThemedText>
        </ThemedButton>
      )}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  formGroup: {
    width: "100%",
    marginTop: 15,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    width: 180,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    textAlign: "center",
    fontSize: 20,
  },
  missing: {
    borderColor: "#E63946",
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 6,
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
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
