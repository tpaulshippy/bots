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
        resizeMode="contain"
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  appleButton: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  appleButtonPressed: {
    opacity: 0.8,
  },
  logo: {
    height: 50,
    width: 300,
  },
});

export default AppleSignInButton;
