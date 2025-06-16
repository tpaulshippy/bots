import React, { useState, PropsWithChildren, useEffect, useCallback } from "react";
import { StyleSheet, Alert, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { getCachedPin, clearCachedPin } from "@/api/pinStorage";
import { clearUser } from "@/api/tokens";
import { router } from "expo-router";

type Props = PropsWithChildren<{
  correctPin: string;
  onPinVerified?: () => void;
}>;

export default function PinWrapper({ children, correctPin, onPinVerified }: Props) {
  const [pinCorrect, setPinCorrect] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [enteredPin, setEnteredPin] = useState("");

  // Check if we need to verify the PIN (always verify for settings access)
  useEffect(() => {
    setIsVerifying(false);
  }, []);

  useEffect(() => {
    if (enteredPin === correctPin && enteredPin.length > 0) {
      try {
        setPinCorrect(true);
        onPinVerified?.();
      } catch (error) {
        console.error("Error handling PIN verification:", error);
      }
    }
  }, [enteredPin, correctPin, onPinVerified]);



  if (isVerifying) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Verifying...</ThemedText>
      </ThemedView>
    );
  }

  if (pinCorrect || correctPin === "") {
    return (
      <ThemedView style={styles.container}>
        {children}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.outerContainer}>
      <View style={styles.innerContainer}>
        <ThemedText style={styles.title}>Enter PIN</ThemedText>
        <ThemedTextInput
          autoFocus={true}
          style={styles.pinTextInput}
          keyboardType="numeric"
          secureTextEntry={true}
          value={enteredPin}
          onChangeText={setEnteredPin}
          placeholderTextColor="#999"

        />

      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
  },
  exitButton: {
    textAlign: "center",
    padding: 5,
  },
  outerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    padding: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  pinTextInput: {
    width: '100%',
    padding: 15,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },


});
