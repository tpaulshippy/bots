import { Pressable } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

export type ThemedButtonProps = {
  lightColor?: string;
  darkColor?: string;
  onPress?: () => void;
  style?: any;
  children?: any;
  disabled?: boolean;
};
export function ThemedButton({
  style,
  lightColor,
  darkColor,
  children,
  onPress,
  ...otherProps
}: ThemedButtonProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "tint"
  );
  return (
    <Pressable
      style={[{ backgroundColor }, style]}
      onPress={onPress}
      {...otherProps}
    >
      {children}
    </Pressable>
  );
}
