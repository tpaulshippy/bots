import { useThemeColor } from "@/hooks/useThemeColor";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { IconSymbol } from "./ui/IconSymbol";

export type DrawerMenuButtonProps = {
  onOpen: () => void;
};

export function DrawerMenuButton({ onOpen }: DrawerMenuButtonProps) {
  const iconColor = useThemeColor({}, "tint");
  return (
    <Pressable onPress={onOpen}>
      <IconSymbol
        name="line.3.horizontal"
        color={iconColor}
        size={40}
        style={styles.menuIcon}
      ></IconSymbol>
    </Pressable>
  );
}

export type BackButtonProps = {
  onPress: () => void;
};

export function BackButton({ onPress }: BackButtonProps) {
  const iconColor = useThemeColor({}, "tint");
  return (
    <Pressable onPress={onPress}>
      <IconSymbol
        name="chevron.backward"
        color={iconColor}
        size={40}
        style={styles.menuIcon}
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
  menuIcon: {
    marginLeft: 5,
  },
});
