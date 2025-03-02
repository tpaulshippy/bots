import React from 'react';
import { Linking, Pressable, Text, StyleSheet, Image, useColorScheme } from 'react-native';

type AppleSignInButtonProps = {
  onPress: () => void;
}

export const AppleSignInButton = ({ onPress }: AppleSignInButtonProps) => {
  const colorScheme = useColorScheme();
  const imageSource = colorScheme === "dark" ? require("../assets/images/apple-sign-in-dark.png") : require("../assets/images/apple-sign-in.png");

  return (
    <Pressable onPress={onPress} 
    style={({ pressed }) => [
      styles.appleButton,
      pressed && styles.appleButtonPressed,
    ]}>
      <Image
        source={imageSource}
        style={styles.logo}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  appleButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  appleButtonPressed: {
    opacity: 0.8,
  },
  logo: {
  },
});

export default AppleSignInButton;
