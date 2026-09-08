import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function OnboardingWelcome() {
  const router = useRouter();
  const { review } = useLocalSearchParams<{ review?: string }>();
  const isReview = review === "true";
  const tintColor = useThemeColor({}, "tint");

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
    <ThemedView style={styles.container}>
      <Pressable
        testID="onboarding-close"
        onPress={exitWizard}
        style={styles.closeButton}
        accessibilityLabel="Close"
      >
        <IconSymbol name="xmark" color={tintColor} size={24} />
      </Pressable>
      <ThemedView style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: tintColor }]}>
          <IconSymbol name="wand.and.sparkles" color="#fff" size={44} />
        </View>
        <ThemedText type="title" style={styles.title} testID="onboarding-welcome-title">
          Welcome to Syft
        </ThemedText>
        <ThemedText style={styles.tagline}>
          Syft is AI tutoring you control.
        </ThemedText>
        <ThemedText style={styles.detail}>
          Set up your student&apos;s profile and first bot in under three
          minutes. Free to start.
        </ThemedText>
        {isReview ? (
          <ThemedText style={styles.reviewNote} testID="onboarding-review-banner">
            Reviewing your current setup.
          </ThemedText>
        ) : null}
      </ThemedView>
      <ThemedButton
        testID="onboarding-get-started"
        style={styles.cta}
        onPress={() => {
          if (isReview) {
            router.push({
              pathname: "/onboarding/profile",
              params: { review: "true" },
            });
          } else {
            router.push("/onboarding/profile");
          }
        }}
      >
        <ThemedText lightColor="#fff" darkColor="#fff" style={styles.ctaText}>
          Get started
        </ThemedText>
      </ThemedButton>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  closeButton: {
    alignSelf: "flex-end",
    padding: 4,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    textAlign: "center",
  },
  tagline: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 12,
    fontWeight: "600",
  },
  detail: {
    fontSize: 15,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  reviewNote: {
    fontSize: 13,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 12,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
