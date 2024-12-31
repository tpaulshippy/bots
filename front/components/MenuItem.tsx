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
  const theme = useColorScheme() ?? 'light';
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background"
  );
  const iconColor = useThemeColor({}, "icon");
  return (
    <PlatformPressable
      style={[{ backgroundColor }, style]}
      onPress={onPress}
      {...otherProps}
    >
      <ThemedView style={styles.container}>
        <IconSymbol name={iconName} style={styles.icon} color={iconColor} />
        <ThemedText style={styles.title}>{title}</ThemedText>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
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
    padding: 10,
    marginLeft: 10
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
