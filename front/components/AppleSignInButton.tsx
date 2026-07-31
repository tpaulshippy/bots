import React from 'react';
import { Pressable, StyleSheet, Image } from 'react-native';

type AppleSignInButtonProps = {
  onPress: () => void;
}

export const AppleSignInButton = ({ onPress }: AppleSignInButtonProps) => {
  return (
    <Pressable testID="apple-sign-in-button" onPress={onPress}
    style={({ pressed }) => [
      styles.appleButton,
      pressed && styles.appleButtonPressed,
    ]}>
      <Image
        source={require("../assets/images/apple-sign-in.png")}
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
