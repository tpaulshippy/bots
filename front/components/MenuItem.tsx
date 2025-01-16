import { useThemeColor } from "@/hooks/useThemeColor";
import { PlatformPressable } from "@react-navigation/elements";
import { StyleSheet, useColorScheme } from "react-native";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { IconSymbol, IconSymbolName } from "./ui/IconSymbol";
import { Colors } from "@/constants/Colors";

export type MenuItemProps = {
  lightColor?: string;
  darkColor?: string;
  onPress?: () => void;
  style?: any;
  iconName: IconSymbolName;
  title: string;
};
export function MenuItem({
  style,
  lightColor,
  darkColor,
  iconName,
  title,
  onPress,
  ...otherProps
}: MenuItemProps) {
  const theme = useColorScheme() ?? "light";
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "cardBackground"
  );
  const borderColor = useThemeColor(
    { light: '#ddd', dark: '#444' },
    "background"
  );
  const iconColor = useThemeColor({}, "icon");
  return (
    <PlatformPressable
      style={[{ backgroundColor }, styles.container, style]}
      onPress={onPress}
      {...otherProps}
    >
      <IconSymbol name={iconName} style={styles.icon} color={iconColor} />
      <ThemedView style={[{ backgroundColor, borderColor }, styles.rightContainer]}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          style={styles.icon}
          color={borderColor}
        />
      </ThemedView>
    </PlatformPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 10,
  },
  rightContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  title: {
    flex: 12,
    fontSize: 16,
  },
});
