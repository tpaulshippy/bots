import React,
{
  useCallback,
  useEffect,
  useState,
  PropsWithChildren,
} from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "./ThemedText";
import { getTokens } from "@/api/tokens";
import {
  getParentSession,
  setParentSession,
} from "@/api/pinStorage";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const PIN_MIN_LENGTH = 4;

type Props = PropsWithChildren<{
  /** Called after a successful reauthentication. */
  onUnlocked?: () => void;
}>;

/**
 * Gates parent surfaces behind a fresh server-verified reauthentication.
 * The plaintext PIN is never stored or compared locally: every attempt is
 * checked by POST /auth/reauthenticate, which returns a short-lived parent
 * session token held in memory only.
 */
export default function PinWrapper({ children, onUnlocked }: Props) {
  const [unlocked, setUnlocked] = useState<boolean>(
    () => getParentSession() !== null
  );
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-lock when returning to the app if the parent session has expired.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (getParentSession() === null) {
          setUnlocked(false);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const submitPin = useCallback(
    async (entered: string) => {
      setSubmitting(true);
      setMessage(null);
      const attempt = async () => {
        const tokens = await getTokens();
        const response = await fetch(`${BASE_URL}/auth/reauthenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokens?.access}`,
          },
          body: JSON.stringify({ pin: entered }),
        });
        let data: {
          detail?: string;
          remainingAttempts?: number;
          lockedUntil?: string;
          parentSessionToken?: string;
          expiresAt?: string;
        } | null = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        return { status: response.status, ok: response.ok, data };
      };

      try {
        let result = await attempt();

        // A 401 from the auth layer (expired JWT) has no PIN-specific
        // payload. Refresh once and retry so remaining-attempts handling
        // below only reflects real PIN failures.
        if (
          result.status === 401 &&
          typeof result.data?.remainingAttempts !== "number"
        ) {
          const { refreshWithRefreshToken } = await import("@/api/apiClient");
          try {
            await refreshWithRefreshToken(await getTokens());
          } catch {
            setMessage("Session expired. Please log in again.");
            return;
          }
          result = await attempt();
        }

        const { status, ok, data } = result;

        if (ok && data?.parentSessionToken && data?.expiresAt) {
          setParentSession(data.parentSessionToken, data.expiresAt);
          setUnlocked(true);
          onUnlocked?.();
          return;
        }

        if (status === 423) {
          setLocked(true);
          setMessage(data?.detail || "PIN locked. Try again later.");
          return;
        }

        if (typeof data?.remainingAttempts === "number") {
          const attempts = data.remainingAttempts;
          setMessage(
            attempts > 0
              ? `${attempts} attempt${attempts === 1 ? "" : "s"} remaining`
              : "PIN locked. Try again later."
          );
          return;
        }

        setMessage(data?.detail || "Something went wrong. Try again.");
      } catch {
        setMessage("Network error. Check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [onUnlocked]
  );

  const handleKey = useCallback(
    (digit: string) => {
      if (locked || submitting) {
        return;
      }
      setMessage(null);
      setPin((current) => (current.length >= 8 ? current : current + digit));
    },
    [locked, submitting]
  );

  const handleDelete = useCallback(() => {
    setPin((current) => current.slice(0, -1));
  }, []);

  const handleSubmit = useCallback(() => {
    if (pin.length < PIN_MIN_LENGTH || submitting) {
      return;
    }
    void submitPin(pin);
    setPin("");
  }, [pin, submitting, submitPin]);

  if (unlocked) {
    return (
      <ThemedView style={styles.container}>
        {children}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.outerContainer}>
      <View style={styles.innerContainer}>
        <ThemedText style={styles.title} testID="pin-title">
          Enter parent PIN
        </ThemedText>

        <ThemedText style={styles.dots} testID="pin-dots">
          {"● ".repeat(pin.length).trim() || "···"}
        </ThemedText>

        {!!message && (
          <ThemedText style={styles.error} testID="pin-error">
            {message}
          </ThemedText>
        )}

        <View style={styles.keypad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <Pressable
              key={digit}
              style={styles.key}
              testID={`pin-key-${digit}`}
              onPress={() => handleKey(digit)}
            >
              <ThemedText style={styles.keyText}>{digit}</ThemedText>
            </Pressable>
          ))}
          <Pressable
            style={styles.key}
            testID="pin-delete"
            onPress={handleDelete}
          >
            <ThemedText style={styles.keyText}>⌫</ThemedText>
          </Pressable>
          <Pressable
            style={styles.key}
            testID="pin-key-0"
            onPress={() => handleKey("0")}
          >
            <ThemedText style={styles.keyText}>0</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.key, styles.submitKey]}
            testID="pin-submit"
            disabled={pin.length < PIN_MIN_LENGTH || submitting}
            onPress={handleSubmit}
          >
            <ThemedText style={styles.keyText}>✓</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
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
  dots: {
    fontSize: 22,
    letterSpacing: 4,
    marginBottom: 12,
    minHeight: 28,
  },
  error: {
    fontSize: 14,
    color: '#FF6B6B',
    marginBottom: 12,
    textAlign: 'center',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  key: {
    width: 70,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 22,
  },
  submitKey: {
    borderColor: '#00a4c9',
  },
});
