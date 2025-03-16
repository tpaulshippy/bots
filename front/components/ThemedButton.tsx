import { useThemeColor } from "@/hooks/useThemeColor";
import { PlatformPressable } from "@react-navigation/elements";

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
    <PlatformPressable
      style={[{ backgroundColor }, style]}
      onPress={onPress}
      {...otherProps}
    >
      {children}
    </PlatformPressable>
  );
}
