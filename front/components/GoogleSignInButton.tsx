import React from "react";
import { StyleSheet, Pressable, Text, useColorScheme } from "react-native";
import { Image } from "expo-image";
import { useThemeColor } from "@/hooks/useThemeColor";

interface GoogleSignInButtonProps {
  onPress: () => void;
}

export const GoogleSignInButton = ({ onPress }: GoogleSignInButtonProps) => {
  const colorScheme = useColorScheme();
  const imageSource = colorScheme === "dark" ? require("../assets/images/google-sign-in-dark.png") : require("../assets/images/google-sign-in.png");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.googleButton,
        pressed && styles.googleButtonPressed,
      ]}
    >
      <Image
        source={imageSource}
        style={styles.googleImage}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  googleButtonPressed: {
    opacity: 0.8,
  },
  googleImage: {
    width: 300,
    height: 71,
  },
}); 