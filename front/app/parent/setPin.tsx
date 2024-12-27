import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { updateAccount } from "@/api/account";
import { useState } from "react";

export default function SetPin() {
  const [pin, setPin] = useState("");

  const savePin = () => {
    updateAccount({ pin: parseInt(pin) });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.pinContainer}>
        <ThemedTextInput
          style={styles.pinTextInput}
          keyboardType="numeric"
          secureTextEntry={true}
          onChangeText={setPin}
          placeholder="Enter your pin"
        />
        <TouchableOpacity
          style={styles.savePinButton}
          onPress={() => savePin()}
        >
          <ThemedText>Save new pin</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    flexDirection: "column",
  },
  pinContainer: {
    flexDirection: "row",
    paddingLeft: 20,
  },
  list: {
    padding: 20,
  },
  pinTextInput: {
    width: 160,
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
  savePinButton: {
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
