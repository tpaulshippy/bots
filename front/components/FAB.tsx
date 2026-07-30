import { StyleSheet, Pressable } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { IconSymbol, IconSymbolName } from "./ui/IconSymbol";

export type FABProps = {
  icon: IconSymbolName;
  onPress?: () => void;
  style?: any;
};

export function FAB({ icon, onPress, style }: FABProps) {
  const backgroundColor = useThemeColor({}, "tint");
  return (
    <Pressable
      style={[styles.fab, { backgroundColor }, style]}
      onPress={onPress}
    >
      <IconSymbol name={icon} color="white" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 15,
  },
});
