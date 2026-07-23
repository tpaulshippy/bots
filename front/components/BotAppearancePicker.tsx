import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol, IconSymbolName } from "@/components/ui/IconSymbol";
import { BOT_COLORS, BOT_ICONS } from "@/constants/botAppearance";
import { useThemeColor } from "@/hooks/useThemeColor";

type Props = {
  color: string;
  icon: IconSymbolName;
  onSelect: (patch: { color?: string; icon?: string }) => void;
};

export function BotAppearancePicker({ color, icon, onSelect }: Props) {
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({}, "cardBackground");

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.label}>Color</ThemedText>
      <View style={styles.row}>
        {BOT_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={`Color ${c}`}
            onPress={() => onSelect({ color: c })}
            style={[
              styles.swatch,
              { backgroundColor: c },
              c === color && { borderColor: textColor },
            ]}
          />
        ))}
      </View>
      <ThemedText style={styles.label}>Icon</ThemedText>
      <View style={styles.row}>
        {BOT_ICONS.map((i) => (
          <Pressable
            key={String(i)}
            accessibilityRole="button"
            accessibilityLabel={`Icon ${String(i)}`}
            onPress={() => onSelect({ icon: String(i) })}
            style={[
              styles.iconOption,
              { backgroundColor: i === icon ? color : bgColor },
            ]}
          >
            <IconSymbol
              name={i}
              size={28}
              color={i === icon ? "#fff" : textColor}
            />
          </Pressable>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 5,
    borderWidth: 3,
    borderColor: "transparent",
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 10,
    marginBottom: 5,
    justifyContent: "center",
    alignItems: "center",
  },
});
