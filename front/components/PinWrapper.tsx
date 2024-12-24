import React, { PropsWithChildren } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "./ThemedText";

type Props = PropsWithChildren<{}>;

export default function PinWrapper({ children }: Props) {
  const [pin, setPin] = React.useState("");
  const [pinCorrect, setPinCorrect] = React.useState(false);

  return (
    <>
      {pinCorrect ? (
        children
      ) : (
        <View>
          <ThemedView style={styles.container}>
            <ThemedTextInput
              style={styles.pinTextInput}
              secureTextEntry={true}
              onChangeText={setPin}
              placeholder="Enter your pin"
            />
            <TouchableOpacity
              style={styles.pinButton}
              onPress={async () => {
                if (pin === "1234") {
                  setPinCorrect(true);
                }
              }}
            >
                <ThemedText>Submit</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignContent: "center",
    padding: 10,
  },
  pinTextInput: {
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
