import React from "react";
import { Link, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { View, StyleSheet, Platform } from "react-native";

const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/login/";

const LoginScreen = () => {
  if (Platform.OS === "web") {
    const urlParams = new URLSearchParams(window.location.search);
    const access = urlParams.get("access");
    const refresh = urlParams.get("refresh");
    if (!access && !refresh) {
      const router = useRouter();
      console.log("Redirecting to login page");
      router.push("http://localhost:8000/api/login/web");
    }
  }

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? null : (
        <WebView
          source={{
            uri: LOGIN_URL,
          }}
          style={styles.webview}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export default LoginScreen;
