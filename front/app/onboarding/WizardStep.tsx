import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Pressable } from "react-native";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";

/**
 * Shared chrome for the first-run wizard: a step counter plus an optional
 * back control. Critical steps keep the CTA visible and simply don't render
 * a forward path until their input is valid (skip-resistant).
 */
export function WizardStep({
  step,
  total = 5,
  title,
  subtitle,
  children,
  onBack,
  onClose,
  review = false,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  /** X control: exits the wizard without saving (review → Settings). */
  onClose?: () => void;
  /** Review mode: re-walking the wizard to verify the current setup. */
  review?: boolean;
}) {
  const tintColor = useThemeColor({}, "tint");
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.avoider}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            {onBack ? (
              <Pressable testID="onboarding-back" onPress={onBack} style={styles.backSlot}>
                <IconSymbol name="chevron.backward" color={tintColor} size={28} />
              </Pressable>
            ) : (
              <View style={styles.backSlot} />
            )}
            <ThemedText style={styles.stepLabel} type="defaultSemiBold">
              Step {step} of {total}
            </ThemedText>
            {onClose ? (
              <Pressable testID="onboarding-close" onPress={onClose} style={styles.closeSlot}>
                <IconSymbol name="xmark" color={tintColor} size={24} />
              </Pressable>
            ) : (
              <View style={styles.backSlot} />
            )}
          </View>
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
          ) : null}
          {review ? (
            <ThemedText style={styles.reviewBanner} testID="onboarding-review-banner">
              Reviewing your current setup.
            </ThemedText>
          ) : null}
          {children}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    minHeight: 32,
  },
  backSlot: {
    width: 32,
    alignItems: "flex-start",
  },
  closeSlot: {
    width: 32,
    alignItems: "flex-end",
  },
  stepLabel: {
    opacity: 0.6,
    fontSize: 14,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 8,
    marginBottom: 20,
  },
  reviewBanner: {
    fontSize: 13,
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 8,
  },
});
