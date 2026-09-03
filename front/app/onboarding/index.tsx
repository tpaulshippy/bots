import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function OnboardingWelcome() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");

  return (
    <ThemedView style={styles.container}>
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
          Set up your child&apos;s profile and first tutor in under three
          minutes. Free to start.
        </ThemedText>
      </ThemedView>
      <ThemedButton
        testID="onboarding-get-started"
        style={styles.cta}
        onPress={() => router.push("/onboarding/profile")}
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
