import { StyleSheet, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import {
  getAccount,
  setPin as setPinApi,
} from "@/api/account";
import { getCachedHasPin, setCachedHasPin, clearParentSession } from "@/api/pinStorage";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";

const PIN_PATTERN = /^\d{4,8}$/;

export default function SetPin() {
  const router = useRouter();
  const [hasPin, setHasPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Prefer the fresh server answer; fall back to the cached flag offline.
    getAccount().then((account) => {
      if (account && typeof account.hasPin === "boolean") {
        setHasPin(account.hasPin);
        setCachedHasPin(account.hasPin);
      } else {
        getCachedHasPin().then(setHasPin);
      }
    });
  }, []);

  const validationError = useCallback((): string | null => {
    if (!PIN_PATTERN.test(pin)) {
      return "New PIN must be 4 to 8 digits.";
    }
    if (pin !== confirmPin) {
      return "PINs do not match.";
    }
    if (hasPin && !PIN_PATTERN.test(currentPin)) {
      return "Enter your current PIN to change it.";
    }
    return null;
  }, [pin, confirmPin, currentPin, hasPin]);

  const savePin = useCallback(async () => {
    const problem = validationError();
    if (problem || saving) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await setPinApi(pin, hasPin ? currentPin : undefined);

      if (!response || !response.ok) {
        const status = response?.status;
        setError(
          status === 403
            ? "Current PIN is incorrect, or your reauthentication expired. Go back and unlock again."
            : status === 400
              ? "New PIN must be 4 to 8 digits."
              : "Could not save PIN. Check your connection and try again."
        );
        return;
      }

      // The old parent session was minted for the previous PIN state.
      clearParentSession();
      await setCachedHasPin(true);

      router.back();
    } catch (error) {
      console.error("Error updating PIN:", error);
      setError("Could not save PIN. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [currentPin, hasPin, pin, router, saving, validationError]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.form}>
        <ThemedText style={styles.hint}>
          {hasPin
            ? "Change your parent PIN (4–8 digits)."
            : "Set a parent PIN (4–8 digits) to protect parent controls."}
        </ThemedText>

        {hasPin && (
          <ThemedTextInput
            style={styles.input}
            testID="pin-current-input"
            keyboardType="numeric"
            secureTextEntry={true}
            maxLength={8}
            value={currentPin}
            onChangeText={(text) => setCurrentPin(text.replace(/[^0-9]/g, ""))}
            placeholder="Current PIN"
          />
        )}

        <ThemedTextInput
          style={styles.input}
          testID="pin-new-input"
          keyboardType="numeric"
          secureTextEntry={true}
          maxLength={8}
          value={pin}
          onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ""))}
          placeholder="New PIN (4–8 digits)"
        />

        <ThemedTextInput
          style={styles.input}
          testID="pin-confirm-input"
          keyboardType="numeric"
          secureTextEntry={true}
          maxLength={8}
          value={confirmPin}
          onChangeText={(text) => setConfirmPin(text.replace(/[^0-9]/g, ""))}
          placeholder="Confirm new PIN"
        />

        {!!error && (
          <ThemedText style={styles.error} testID="pin-error">
            {error}
          </ThemedText>
        )}

        <ThemedButton
          style={[styles.saveButton, (!pin || saving) && styles.disabled]}
          testID="pin-save-button"
          onPress={() => void savePin()}
          disabled={!pin || saving}
        >
          <ThemedText style={styles.saveButtonText}>
            {saving ? "Saving…" : hasPin ? "Change PIN" : "Save PIN"}
          </ThemedText>
        </ThemedButton>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  form: {
    gap: 16,
  },
  hint: {
    fontSize: 14,
    opacity: 0.7,
  },
  input: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    fontSize: 18,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    color: '#FF6B6B',
  },
  saveButton: {
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
