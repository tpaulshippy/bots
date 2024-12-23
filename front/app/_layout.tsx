import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import LoginScreen from "./screens/login";
import { loggedInUser } from "@/api/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [user, setUser] = useState(null);
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const access = urlParams.get("access");
    const refresh = urlParams.get("refresh");
    if (access && refresh) {
      console.log("Setting user from query string");
      const user = { access, refresh };
      setUser(user);
      AsyncStorage.setItem("loggedInUser", JSON.stringify(user));
    }
  }, []);
  
  useEffect(() => {
    loggedInUser().then((user) => {
      if (user) {
        setUser(user);
      }
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      {user ? (
        <Stack>
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              title: "Chats",
            }}
          />
          <Stack.Screen
            name="screens/chat"
            options={{
              headerShown: true,
              headerBackTitle: "Back to List",
              headerTintColor: "#BBB",
              title: "Chat",
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
      ) : (
        <LoginScreen />
      )}

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
