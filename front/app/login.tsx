import React, { useEffect } from "react";
import { StyleSheet, Platform, Button } from "react-native";
import { ExternalLink } from "@/components/ExternalLink";
import { ThemedView } from "@/components/ThemedView";
import * as Linking from "expo-linking";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { setTokens } from "@/api/tokens";
import { useRouter } from "expo-router";

const LOCAL_DEV_WEB_LOGIN_URL = "http://localhost:8000/api/login/web";
const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/login/";

const LoginScreen = () => {
  const router = useRouter();
  const url = Linking.useURL();
  const [manualTokens, setManualTokens] = React.useState("");

  useEffect(() => {
    const getJWTFromLink = async () => {
      if (url) {
        const { queryParams } = Linking.parse(url);

        if (queryParams && queryParams["access"] && queryParams["refresh"]) {
          const access = queryParams["access"] as string;
          const refresh = queryParams["refresh"] as string;
          await setTokens({ access, refresh });
        }
      }
    };

    getJWTFromLink();
  }, []);

  return (
    <ThemedView style={styles.container}>
      {Platform.OS === "web" ? (
        <ExternalLink style={styles.loginLink} href={LOCAL_DEV_WEB_LOGIN_URL}>
          Login with Google
        </ExternalLink>
      ) : (
        <ExternalLink style={styles.loginLink} href={LOGIN_URL}>
          Login with Google
        </ExternalLink>
      )}
      <ThemedTextInput
        onChangeText={(text) => setManualTokens(text)}
        placeholder="Paste tokens here"
      />
      <Button
        title="Submit"
        onPress={async () => {
          await setTokens(JSON.parse(manualTokens));
          router.replace("/");
        }}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 40,
  },
  loginLink: {
    color: "white",
  },
});

export default LoginScreen;
