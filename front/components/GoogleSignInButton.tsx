import React from "react";
import { StyleSheet, Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { useThemeColor } from "@/hooks/useThemeColor";

interface GoogleSignInButtonProps {
  onPress: () => void;
}

export const GoogleSignInButton = ({ onPress }: GoogleSignInButtonProps) => {
  const borderColor = useThemeColor({}, "border");
  
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.googleButton,
        { borderColor },
        pressed && styles.googleButtonPressed,
      ]}
    >
      <Image
        source={require("../assets/images/google-g-logo.png")}
        style={styles.googleIcon}
      />
      <Text style={styles.googleButtonText}>Sign in with Google</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  googleButtonPressed: {
    opacity: 0.8,
  },
  googleIcon: {
    width: 18,
    height: 18,
    marginRight: 24,
  },
  googleButtonText: {
    color: "#757575",
    fontSize: 15,
    fontWeight: "500",
  },
}); 