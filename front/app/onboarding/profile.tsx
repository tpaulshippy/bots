import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { fetchProfiles } from "@/api/profiles";
import { WizardStep } from "./WizardStep";

export default function OnboardingProfile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // The signup signal already created a profile (named after the parent's
    // first name); pre-fill and rename it instead of creating a duplicate.
    fetchProfiles().then((data) => {
      const existing = data?.results?.[0]?.name;
      if (existing) {
        setName(existing);
      }
      setLoaded(true);
    });
  }, []);

  const canContinue = name.trim().length > 0;

  return (
    <WizardStep
      step={2}
      title="Who will be chatting?"
      onBack={() => router.back()}
    >
      <ThemedTextInput
        testID="onboarding-profile-input"
        value={name}
        onChangeText={setName}
        placeholder="Child's first name"
        autoFocus
        style={[styles.input, canContinue ? undefined : styles.missing]}
      />
      {!canContinue && loaded ? (
        <ThemedText style={styles.hint}>A profile name is required.</ThemedText>
      ) : null}
      <ThemedButton
        testID="onboarding-profile-continue"
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={() =>
          router.push({
            pathname: "/onboarding/bot",
            params: { profileName: name.trim() },
          })
        }
      >
        <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
          Continue
        </ThemedText>
      </ThemedButton>
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    fontSize: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 12,
    textAlign: "center",
    marginTop: 8,
  },
  missing: {
    borderColor: "#E63946",
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 10,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: "auto",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
