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
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedView } from "@/components/ThemedView";
import {
  bootstrapOnboarding,
  completeOnboarding,
} from "@/api/account";
import { fetchBots } from "@/api/bots";
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  // Never let a notification-registration hiccup block finishing setup.
  useEffect(() => {
    if (!notificationsEnabled) {
      return;
    }
    registerForPushNotificationsAsync().catch((error) => {
      Sentry.captureException?.(error);
    });
  }, [notificationsEnabled]);

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
      title="Keep settings grown-up only"
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
          placeholder="4–8 digits, or leave blank"
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
          placeholder="Re-enter PIN, or leave blank"
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
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
        />
      </ThemedView>
      <ThemedText style={styles.optionalNote}>
        Optional — you can turn this on anytime in Settings.
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
