import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { updateAccount } from "@/api/account";
import { useLayoutEffect, useState, useCallback } from "react";
import { ThemedButton } from "@/components/ThemedButton";
import { useNavigation, useRouter } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { setCachedPin } from "@/api/pinStorage";
import { getAccount } from "@/api/account";

export default function SetPin() {
  const navigation = useNavigation();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const iconColor = useThemeColor({}, "tint");

  const savePin = useCallback(async () => {
    try {
      // Update the PIN on the server
      await updateAccount({ pin: parseInt(pin) });
      
      // Update the cached PIN
      await setCachedPin(pin);
      
      // Refresh the account info to ensure we have the latest data
      await getAccount();
      
      router.back();
    } catch (error) {
      console.error("Error updating PIN:", error);
      // Handle error (you might want to show an error message to the user)
    }
  }, [pin, router]);

  useLayoutEffect(() => {
    if (pin.length > 0) {
      navigation.setOptions({
        headerRight: () => (
          <PlatformPressable onPress={savePin}>
            <IconSymbol
              name="checkmark"
              color={iconColor}
              size={40}
              style={styles.saveIcon}
            ></IconSymbol>
          </PlatformPressable>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: () => null,
      });
    }
  }, [navigation, savePin, pin]);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.pinContainer}>
        <ThemedTextInput
          style={styles.pinTextInput}
          keyboardType="numeric"
          secureTextEntry={true}
          onChangeText={setPin}
          placeholder="Enter new pin"
        />
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
    flex: 1,
    flexDirection: "column",
  },
  list: {
    padding: 20,
  },
  pinTextInput: {
    width: 130,
    padding: 10,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  savePinButton: {
    marginTop: 10,
    alignItems: "center",
    width: 130,
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  saveIcon: {
    marginRight: 5,
  },
});
