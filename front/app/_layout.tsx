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
import { Platform } from "react-native";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  type User = { access: string; refresh: string } | null;
  const [user, setUser] = useState<User>(null);
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const logInFromWeb = async () => {
    if (Platform.OS === "web") {
      const urlParams = new URLSearchParams(window.location.search);
      const access = urlParams.get("access");
      const refresh = urlParams.get("refresh");
      if (access && refresh) {
        const user = { access, refresh };
        setUser(user);
        AsyncStorage.setItem("loggedInUser", JSON.stringify(user));
      }
    }
  };

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
    logInFromWeb();
    loggedInUser().then((user) => {
      if (user) {
        setUser(user);
      }
    });
  }, [loaded]);

  if (!loaded) {
    return null;
  }

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
