import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Platform, Button, View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import * as Linking from "expo-linking";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { setTokens, getTokens, TokenData, clearUser } from "@/api/tokens";
import { useRouter } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AppleSignInButton } from "@/components/AppleSignInButton";
import { ThemedButton } from "@/components/ThemedButton";
import * as WebBrowser from 'expo-web-browser';
import { setCachedPin, getCachedPin, clearCachedPin } from "@/api/pinStorage";
import { getAccount } from "@/api/account";
import { UnauthorizedError } from "@/api/apiClient";
import PinWrapper from "@/components/PinWrapper";


const LOCAL_DEV_WEB_LOGIN_URL = "http://localhost:8000/api/login/web";
const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/auto-login/";
const APPLE_LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/apple/auto-login/";

const LoginScreen = () => {
  const [manualTokens, setManualTokens] = React.useState("");
  const [isCheckingPin, setIsCheckingPin] = useState(true);
  const [cachedPin, setCachedPinState] = useState<string | null>(null);
  const router = useRouter();
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");

  useEffect(() => {
    const checkForCachedPin = async () => {
      try {
        const pin = await getCachedPin();
        setCachedPinState(pin);
      } catch (error) {
        console.error("Error checking for cached PIN:", error);
      } finally {
        setIsCheckingPin(false);
      }
    };

    checkForCachedPin();
  }, []);

  const handlePinVerified = () => {
    setCachedPinState(null);
  };

  const handleClearPin = async () => {
    await clearCachedPin();
    setCachedPinState(null);
  };

  const handleSuccessfulLogin = async (skipPinCache = false) => {
    try {
      // Get the account info which contains the PIN
      const account = await getAccount();
      if (account) {
        // Cache the PIN for future use if it exists and we're not skipping the cache
        if (!skipPinCache && account.pin !== null) {
          await setCachedPin(account.pin.toString());
        }
      }
      router.replace("/");
    } catch (error) {
      console.error("Error during login:", error);
      // If we get an unauthorized error, try with the cached PIN if available
      if (error instanceof UnauthorizedError) {
        try {
          const cachedPin = await getCachedPin();
          if (cachedPin) {
            // Try to re-authenticate with the cached PIN
            const tokens = await attemptReauthWithPin(cachedPin);
            if (tokens) {
              await setTokens(tokens);
              // Skip caching the PIN again since we just used it
              return handleSuccessfulLogin(true);
            }
          }
        } catch (reauthError) {
          console.error("Re-authentication failed:", reauthError);
        }
      }
      Alert.alert("Error", "Failed to complete login. Please log in again.");
    }
  };

  const attemptReauthWithPin = async (pin: string): Promise<TokenData | null> => {
    try {
      // Replace this with your actual re-authentication endpoint
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/auth/reauthenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        throw new Error('Re-authentication failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Re-authentication error:', error);
      return null;
    }
  };

  const handleGoogleLogin = async () => {
    try {
      if (Platform.OS === "web") {
        await WebBrowser.openBrowserAsync(LOCAL_DEV_WEB_LOGIN_URL);
      } else {
        await WebBrowser.openBrowserAsync(LOGIN_URL);
      }
      // After successful login, handle the PIN caching
      await handleSuccessfulLogin();
    } catch (error) {
      console.error("Google login error:", error);
    }
  };

  const handleAppleLogin = async () => {
    try {
      await WebBrowser.openBrowserAsync(APPLE_LOGIN_URL);
      // After successful login, handle the PIN caching
      await handleSuccessfulLogin();
    } catch (error) {
      console.error("Apple login error:", error);
    }
  };

  if (isCheckingPin) {
    return (
      <ThemedView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (cachedPin) {
    return (
      <ThemedView style={styles.container}>
          <PinWrapper 
            correctPin={cachedPin} 
            onPinVerified={handlePinVerified}
          />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.devSection, { borderBottomColor: borderColor }]}>
        <Text style={[styles.devSectionTitle, { color: textColor }]}>Developer Options</Text>
        <ThemedTextInput
          onChangeText={(text) => setManualTokens(text)}
          placeholder="Paste tokens here"
          style={styles.tokenInput}
        />
        <Button
          title="Submit"
          onPress={async () => {
            try {
              await setTokens(JSON.parse(manualTokens));
              // After setting tokens, get account info and cache the PIN if it exists
              const account = await getAccount();
              if (account?.pin !== null && account?.pin !== undefined) {
                await setCachedPin(account.pin.toString());
              }
              router.replace("/");
            } catch (error) {
              console.error("Error during manual login:", error);
              Alert.alert("Error", "Invalid token format. Please check and try again.");
            }
          }}
        />
      </View>

      <ThemedView style={styles.mainContent}>
        <GoogleSignInButton onPress={handleGoogleLogin} />
        <View style={styles.appleButton}>
          <AppleSignInButton onPress={handleAppleLogin} />
        </View>
      </ThemedView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  devSection: {
    display: "flex",
    padding: 20,
    borderBottomWidth: 1,
  },
  devSectionTitle: {
    fontSize: 12,
    marginBottom: 10,
    textAlign: "center",
  },
  tokenInput: {
    marginBottom: 10,
  },
  appleButton: {
    marginTop: 30,
  },
});

export default LoginScreen;
