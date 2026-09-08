import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
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
    review?: string;
  }>();
  const isReview = local.review === "true";

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");

  // PIN is optional (PIN-less accounts are supported): leaving both fields
  // empty continues without a PIN. A half-filled PIN must match and be valid.
  // The PIN travels to the final step, which saves the whole wizard at once.
  const pinEmpty = pin.length === 0 && pinConfirm.length === 0;
  const pinValid = PIN_PATTERN.test(pin) && pin === pinConfirm;
  const pinError =
    !pinEmpty && !pinValid
      ? !PIN_PATTERN.test(pin) && pin.length > 0
        ? "PIN must be 4 to 8 digits."
        : "PINs don't match yet."
      : null;
  const canContinue = pinEmpty || pinValid;

  const continueToNotifications = () => {
    if (!canContinue) {
      return;
    }
    router.push({
      pathname: "/onboarding/notifications",
      params: {
        profileName: local.profileName ?? "",
        ...(local.studentEmail ? { studentEmail: local.studentEmail } : {}),
        ...(local.botName ? { botName: local.botName } : {}),
        ...(local.templateName ? { templateName: local.templateName } : {}),
        ...(local.systemPrompt ? { systemPrompt: local.systemPrompt } : {}),
        ...(local.color ? { color: local.color } : {}),
        ...(local.icon ? { icon: local.icon } : {}),
        ...(pinValid ? { pin } : {}),
        ...(isReview ? { review: "true" } : {}),
      },
    });
  };

  return (
    <WizardStep
      step={4}
      title="Keep settings parent-only"
      subtitle="Optional — skip to leave parent controls unprotected."
      onBack={() => router.back()}
      review={isReview}
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
      <ThemedButton
        testID="onboarding-pin-continue"
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={continueToNotifications}
      >
        <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
          {pinEmpty ? "Continue without a PIN" : "Continue"}
        </ThemedText>
      </ThemedButton>
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
