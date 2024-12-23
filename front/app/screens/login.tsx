import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, StyleSheet, Platform } from "react-native";
import { ExternalLink } from "@/components/ExternalLink";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOGIN_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL + "/accounts/google/login/";

const LoginScreen = () => {
  const url = Linking.useURL();

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
  useEffect(() => {
    const getJWTFromLink = async () => {
      if (url) {
        const { queryParams } = Linking.parse(url);

        if (
          queryParams &&
          queryParams["access"] &&
          queryParams["refresh"]
        ) {
          const access = queryParams["access"];
          const refresh = queryParams["refresh"];
          console.log("Setting user from query string");
          console.log({ access, refresh });
          AsyncStorage.setItem(
            "loggedInUser",
            JSON.stringify({ access, refresh })
          );
        }
      }
    };

    getJWTFromLink();
  }, []);

  return (
    <View style={styles.container}>
      {Platform.OS === "web" ? null : (
        <ThemedView>
          <ExternalLink style={{ color: "white" }} href={LOGIN_URL}>
            Login with Google
          </ExternalLink>
          
        </ThemedView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 40,
  },
});

export default LoginScreen;
