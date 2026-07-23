import React from 'react';
import { Pressable, StyleSheet, Image, useColorScheme } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

type AppleSignInButtonProps = {
  onPress: () => void;
}

export const AppleSignInButton = ({ onPress }: AppleSignInButtonProps) => {
  const colorScheme = useColorScheme();
  const imageSource = colorScheme === "dark" ? require("../assets/images/apple-sign-in-dark.png") : require("../assets/images/apple-sign-in.png");
  const cardBackgroundColor = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");

  return (
    <Pressable testID="apple-sign-in-button" onPress={onPress} 
    style={({ pressed }) => [
      styles.appleButton,
      { backgroundColor: cardBackgroundColor, borderColor },
      pressed && styles.appleButtonPressed,
    ]}>
      <Image
        source={imageSource}
        style={styles.logo}
        resizeMode="contain"
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  appleButton: {
    width: "100%",
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  appleButtonPressed: {
    opacity: 0.8,
  },
  logo: {
    width: "100%",
    height: "100%",
  },
});

export default AppleSignInButton;
