import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { fetchProfiles } from "@/api/profiles";
import { getSelectedProfile } from "@/hooks/useSelectedProfile";
import { WizardStep } from "./WizardStep";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OnboardingProfile() {
  const router = useRouter();
  const { review } = useLocalSearchParams<{ review?: string }>();
  const isReview = review === "true";
  const [name, setName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  // Review mode targets the pre-filled row on save (see bootstrap
  // profileId): the selected profile, else the first on the account.
  const [profileId, setProfileId] = useState<string | null>(null);

  // Review mode: pre-fill with what's currently configured so the wizard
  // doubles as a way to verify the setup. Prefer the selected profile,
  // fall back to the first profile on the account.
  useEffect(() => {
    if (!isReview) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const selected = await getSelectedProfile().catch(() => null);
        const profiles = await fetchProfiles().catch(() => null);
        const selectedId =
          selected && typeof selected.profile_id === "string"
            ? selected.profile_id
            : null;
        const current =
          (selectedId &&
            profiles?.results?.find((profile) => profile.profile_id === selectedId)) ||
          profiles?.results?.[0] ||
          (selected && typeof selected.name === "string" ? selected : null);
        if (current && active) {
          setName(current.name ?? "");
          setStudentEmail(current.oauth_email ?? "");
          if (typeof current.profile_id === "string") {
            setProfileId(current.profile_id);
          }
        }
      } catch {
        // Prefill is best-effort; the wizard still works blank.
      }
    })();
    return () => {
      active = false;
    };
  }, [isReview]);

  const trimmedEmail = studentEmail.trim();
  const emailValid = trimmedEmail === "" || EMAIL_PATTERN.test(trimmedEmail);
  const canContinue = name.trim().length > 0 && emailValid;

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

  return (
    <WizardStep
      step={2}
      title="Who will be chatting?"
      subtitle="They can sign in themselves with this email."
      onBack={() => router.back()}
      onClose={exitWizard}
      review={isReview}
    >
      <ThemedTextInput
        testID="onboarding-profile-input"
        value={name}
        onChangeText={setName}
        placeholder="Student name"
        autoFocus
        style={[styles.input, name.trim() ? undefined : styles.missing]}
      />
      {!name.trim() ? (
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
          Optional — lets your student log in as themselves. You can also add
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
              ...(isReview ? { review: "true" } : {}),
              ...(isReview && profileId ? { profileId } : {}),
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
