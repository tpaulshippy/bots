import { useThemeColor } from "@/hooks/useThemeColor";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { IconSymbol } from "./ui/IconSymbol";

export type DrawerMenuButtonProps = {
  onOpen: () => void;
  testID?: string;
};

export function DrawerMenuButton({ onOpen, testID = "drawer-menu-button" }: DrawerMenuButtonProps) {
  const iconColor = useThemeColor({}, "navButtonIcon");
  return (
    <Pressable
      onPress={onOpen}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <IconSymbol
        name="line.3.horizontal"
        color={iconColor}
        size={24}
      ></IconSymbol>
    </Pressable>
  );
}

export type BackButtonProps = {
  onPress: () => void;
  testID?: string;
};

export function BackButton({ onPress, testID = "header-back-button" }: BackButtonProps) {
  const iconColor = useThemeColor({}, "navButtonIcon");
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <IconSymbol
        name="chevron.backward"
        color={iconColor}
        size={22}
        weight="semibold"
      ></IconSymbol>
    </Pressable>
  );
}

export function HeaderLogo() {
  return (
    <View style={styles.headerContainer}>
      <Image
        source={require("../assets/images/syft_small.png")}
        style={{ width: 260, height: 35 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
