import { StyleSheet, View } from "react-native";
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
  title,
  subtitle,
  children,
  onBack,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const tintColor = useThemeColor({}, "tint");
  return (
    <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable testID="onboarding-back" onPress={onBack} style={styles.backSlot}>
            <IconSymbol name="chevron.backward" color={tintColor} size={28} />
          </Pressable>
        ) : (
          <View style={styles.backSlot} />
        )}
        <ThemedText style={styles.stepLabel} type="defaultSemiBold">
          Step {step} of 4
        </ThemedText>
        <View style={styles.backSlot} />
      </View>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      ) : null}
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
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
});
