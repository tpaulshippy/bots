import React, { useState, PropsWithChildren, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "./ThemedText";

type Props = PropsWithChildren<{
  correctPin: string;
}>;

export default function PinWrapper({ children, correctPin }: Props) {
  const [pin, setPin] = useState("");
  const [pinCorrect, setPinCorrect] = useState(false);
  const checkPin = async () => {
    if (pin === correctPin) {
      setPinCorrect(true);
    }
  };

  return pinCorrect ? (
    <View style={styles.container}>{children}</View>
  ) : correctPin == "" ? null : (
    <ThemedView style={styles.outerContainer}>
      <ThemedView style={styles.innerContainer}>
        <ThemedTextInput
          autoFocus={true}
          style={styles.pinTextInput}
          keyboardType="numeric"
          secureTextEntry={true}
          onChangeText={setPin}
          placeholder="Enter your pin"
        />
        <TouchableOpacity
          style={styles.pinButton}
          onPress={async () => {
            checkPin();
          }}
        >
          <ThemedText>Submit</ThemedText>
        </TouchableOpacity>
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
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  innerContainer: {
    flex: 1,
    flexDirection: "row",
    alignContent: "center",
    padding: 10,
  },
  pinTextInput: {
    minWidth: 100,
    padding: 10,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    backgroundColor: "#222",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  pinButton: {
    marginLeft: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#222",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
