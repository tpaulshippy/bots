import React, { useState, PropsWithChildren, useEffect } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";

type Props = PropsWithChildren<{
  correctPin: string;
}>;

export default function PinWrapper({ children, correctPin }: Props) {
  const [pinCorrect, setPinCorrect] = useState(false);
  const checkPin = (enteredPin: string) => {
    if (enteredPin == correctPin) {
      setPinCorrect(true);
    }
  };

  return pinCorrect || correctPin === null ? (
    <ThemedView style={styles.container}>{children}</ThemedView>
  ) : (
    <ThemedView style={styles.outerContainer}>
      <ThemedView style={styles.innerContainer}>
        <ThemedTextInput
          autoFocus={true}
          style={styles.pinTextInput}
          keyboardType="numeric"
          secureTextEntry={true}
          onChangeText={checkPin}
          placeholder="Enter your pin"
        />
      </ThemedView>
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
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  innerContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
  },
  pinTextInput: {
    minWidth: 100,
    padding: 12,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  pinButton: {
    marginTop: 10,
    marginLeft: 10,
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
