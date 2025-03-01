import React, { useCallback, useEffect } from "react";
import { StyleSheet, Platform, Button, View, Text, Pressable } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import * as Linking from "expo-linking";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { setTokens } from "@/api/tokens";
import { useRouter } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const LOCAL_DEV_WEB_LOGIN_URL = "http://localhost:8000/api/login/web";
const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/auto-login/";

const LoginScreen = () => {
  const router = useRouter();
  const [manualTokens, setManualTokens] = React.useState("");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");

  const handleGoogleLogin = () => {
    if (Platform.OS === "web") {
      Linking.openURL(LOCAL_DEV_WEB_LOGIN_URL);
    } else {
      Linking.openURL(LOGIN_URL);
    }
  };

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
            await setTokens(JSON.parse(manualTokens));
            router.back();
          }}
        />
      </View>

      <View style={styles.mainContent}>
        <GoogleSignInButton onPress={handleGoogleLogin} />
      </View>
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
    display: "none",
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
