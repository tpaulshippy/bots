import React, { useEffect, useState } from "react";
import { StyleSheet, Platform, Button, View, Text, Alert, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { getTokens, setTokens } from "@/api/tokens";
import { useRouter } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { AppleSignInButton } from "@/components/AppleSignInButton";
import * as WebBrowser from 'expo-web-browser';
import { clearCachedPin, setCachedHasPin } from "@/api/pinStorage";
import { getAccount } from "@/api/account";
import { fetchOwnProfile } from "@/api/profiles";


const WEB_LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/login/web";
const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/auto-login/";
const APPLE_LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/apple/auto-login/";

const LoginScreen = () => {
  const [manualTokens, setManualTokens] = React.useState("");
  const router = useRouter();
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");

  useEffect(() => {
    // Roadmap doc 02: the plaintext PIN cache is never read again — scrub it.
    clearCachedPin();
  }, []);

  const handleSuccessfulLogin = async () => {
    try {
      // Teen-delegated sessions: never cache a parent PIN, never show a
      // profile picker — lock straight to the claimed profile.
      const tokens = await getTokens();
      if (tokens?.isTeenDelegated) {
        if (tokens.activeProfileId) {
          const ownProfile =
            (await fetchOwnProfile()) ?? { profile_id: tokens.activeProfileId };
          await AsyncStorage.setItem(
            "selectedProfile",
            JSON.stringify(ownProfile)
          );
        }
        router.replace("/");
        return;
      }

      // Refresh the hasPin flag used by the parent-area gate. The PIN itself
      // stays server-side only; unlocking requires POST /auth/reauthenticate.
      const account = await getAccount();
      if (account) {
        await setCachedHasPin(!!account.hasPin);
      }
      router.replace("/");
    } catch (error) {
      console.error("Error during login:", error);
      Alert.alert("Error", "Failed to complete login. Please log in again.");
    }
  };

  const startWebLogin = (provider?: "apple") => {
    const url = provider ? `${WEB_LOGIN_URL}?provider=${provider}` : WEB_LOGIN_URL;
    window.location.assign(url);
  };

  const handleGoogleLogin = async () => {
    try {
      if (Platform.OS === "web") {
        startWebLogin();
        return;
      } else {
        await WebBrowser.openBrowserAsync(LOGIN_URL);
      }
      // Only proceed if login actually completed (tokens were set via deep link)
      const tokens = await getTokens();
      if (tokens?.access && tokens?.refresh) {
        await handleSuccessfulLogin();
      }
    } catch (error) {
      console.error("Google login error:", error);
    }
  };

  const handleAppleLogin = async () => {
    try {
      if (Platform.OS === "web") {
        startWebLogin("apple");
        return;
      }
      await WebBrowser.openBrowserAsync(APPLE_LOGIN_URL);
      // Only proceed if login actually completed (tokens were set via deep link)
      const tokens = await getTokens();
      if (tokens?.access && tokens?.refresh) {
        await handleSuccessfulLogin();
      }
    } catch (error) {
      console.error("Apple login error:", error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {__DEV__ && (
        <View style={[styles.devSection, { borderBottomColor: borderColor }]}>
          <Text style={[styles.devSectionTitle, { color: textColor }]}>Developer Options</Text>
          <ThemedTextInput
            testID="dev-token-input"
            onChangeText={(text) => setManualTokens(text)}
            placeholder="Paste tokens here"
            style={styles.tokenInput}
          />
          <Button
            testID="dev-submit-button"
            title="Submit"
            onPress={async () => {
              try {
                const trimmed = manualTokens.trim();
                await setTokens(JSON.parse(trimmed));
                // Refresh the hasPin flag; the PIN itself stays server-side.
                const account = await getAccount();
                if (account) {
                  await setCachedHasPin(!!account.hasPin);
                }
                router.replace("/");
              } catch (error) {
                console.error("Error during manual login:", error);
                Alert.alert("Error", "Invalid token format. Please check and try again.");
              }
            }}
          />
        </View>
      )}

      <ThemedText style={[styles.tagline, { color: textColor }]}>
        Safe AI tutors for your kids
      </ThemedText>

      <ThemedView style={styles.mainContent}>
        <GoogleSignInButton onPress={handleGoogleLogin} />
        <AppleSignInButton onPress={handleAppleLogin} />
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
    paddingHorizontal: 24,
    gap: 16,
  },
  tagline: {
    marginTop: 16,
    textAlign: "center",
    paddingHorizontal: 24,
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
});

export default LoginScreen;
