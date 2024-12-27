import React, { PropsWithChildren, useEffect } from "react";
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "./ThemedText";
import { useRouter } from "expo-router";
import { getAccount } from "@/api/account";
import { PlatformPressable } from "@react-navigation/elements";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Props = PropsWithChildren<{}>;

export default function PinWrapper({ children }: Props) {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [correctPin, setCorrectPin] = React.useState("");
  const [pinCorrect, setPinCorrect] = React.useState(false);
  const checkPin = async () => {
    if (pin === correctPin) {
      setPinCorrect(true);
    }
  };

  useEffect(() => {
    getAccount().then((account) => {
      if (account)
        setCorrectPin(account.pin.toString());
    });
  }, []);

  return (
    <>
      {correctPin == "" ? <ThemedView>
        <ActivityIndicator style={{marginTop: 10}} />
        <PlatformPressable onPress={() => {
            AsyncStorage.removeItem("loggedInUser");
            router.navigate("/login");
          }} style={styles.exitButton}>
            <ThemedText>Log Out</ThemedText>
          </PlatformPressable>
        </ThemedView> : pinCorrect && correctPin != "" ? (
        <View style={styles.container}>
          {children}
        </View>

      ) : (
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
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column"
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
