import React from "react";
import { StyleSheet, Pressable, useColorScheme } from "react-native";
import { Image } from "expo-image";

interface GoogleSignInButtonProps {
  onPress: () => void;
}

export const GoogleSignInButton = ({ onPress }: GoogleSignInButtonProps) => {
  const colorScheme = useColorScheme();
  const imageSource = colorScheme === "dark" ? require("../assets/images/google-sign-in-dark.png") : require("../assets/images/google-sign-in.png");

  return (
    <Pressable
      testID="google-sign-in-button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.googleButton,
        pressed && styles.googleButtonPressed,
      ]}
    >
      <Image
        source={imageSource}
        style={styles.googleImage}
        contentFit="contain"
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  googleButton: {
    width: "100%",
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonPressed: {
    opacity: 0.8,
  },
  googleImage: {
    width: "100%",
    height: "100%",
  },
}); 