import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { fetchProfiles } from "@/api/profiles";
import { WizardStep } from "./WizardStep";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OnboardingProfile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
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

  const trimmedEmail = studentEmail.trim();
  const emailValid = trimmedEmail === "" || EMAIL_PATTERN.test(trimmedEmail);
  const canContinue = name.trim().length > 0 && emailValid;

  return (
    <WizardStep
      step={2}
      title="Who will be chatting?"
      subtitle="They can sign in themselves with this email."
      onBack={() => router.back()}
    >
      <ThemedTextInput
        testID="onboarding-profile-input"
        value={name}
        onChangeText={setName}
        placeholder="Child's first name"
        autoFocus
        style={[styles.input, name.trim() ? undefined : styles.missing]}
      />
      {!name.trim() && loaded ? (
        <ThemedText style={styles.hint}>A profile name is required.</ThemedText>
      ) : null}
      <ThemedTextInput
        testID="onboarding-student-email-input"
        value={studentEmail}
        onChangeText={setStudentEmail}
        placeholder="Student email (optional)"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, emailValid ? undefined : styles.missing]}
      />
      {!emailValid ? (
        <ThemedText style={styles.hint}>Enter a valid email address.</ThemedText>
      ) : (
        <ThemedText style={styles.optionalNote}>
          Optional — lets your child log in as themselves. You can also add
          it later in Profiles.
        </ThemedText>
      )}
      <ThemedButton
        testID="onboarding-profile-continue"
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={() =>
          router.push({
            pathname: "/onboarding/bot",
            params: {
              profileName: name.trim(),
              ...(trimmedEmail ? { studentEmail: trimmedEmail.toLowerCase() } : {}),
            },
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
    fontSize: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 12,
    textAlign: "center",
    marginTop: 12,
  },
  missing: {
    borderColor: "#E63946",
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 10,
  },
  optionalNote: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 10,
    textAlign: "center",
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
