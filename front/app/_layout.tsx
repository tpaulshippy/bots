import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/useColorScheme";
import { loggedInUser } from "@/api/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, StyleSheet, View } from "react-native";
import { useRouter, Stack } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Image } from 'expo-image';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // enableSpotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  type User = { access: string; refresh: string } | null;
  const [user, setUser] = useState<User>(null);
  const colorScheme = useColorScheme();
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "tint");
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const router = useRouter();
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
          <Stack
            screenOptions={({
              route,
            }: {
              route: { params?: { title?: string } };
            }) => ({ 
              title: route.params?.title || ""
            })}
          >
            <Stack.Screen
              name="index"
              options={{
                headerShown: true,
                headerTitle(props) {
                  return (
                    <View style={styles.headerContainer}>
                      <Image source={require('../assets/images/syft_small.png')} style={{ width: 260, height: 35 }} />
                    </View>
                  );
                },
                headerRight: () => (
                  <PlatformPressable
                    onPress={() => {
                      router.push("/parent/settings");
                    }}
                  >
                    <IconSymbol
                      name="gear"
                      color={iconColor}
                      size={40}
                      style={styles.settingsIcon}
                    ></IconSymbol>
                  </PlatformPressable>
                ),
              }}
            />
            <Stack.Screen
              name="chat"
              options={{
                headerShown: true,
                headerTintColor: textColor,
              }}
            />
            <Stack.Screen
              name="parent/settings"
              options={{
                headerShown: true,
                title: "Settings",
                headerTintColor: textColor,
              }}
            />
            <Stack.Screen
              name="parent/profilesList"
              options={{
                headerShown: true,
                title: "Profiles",
                headerTintColor: textColor,
              }}
            />
            <Stack.Screen
              name="parent/profileEditor"
              options={{
                headerShown: true,
                headerTintColor: textColor,
              }}
            />
             <Stack.Screen
              name="parent/botsList"
              options={{
                headerShown: true,
                title: "Bots",
                headerTintColor: textColor,
                headerRight: () => (
                  <PlatformPressable
                    onPress={() => {
                      router.push("/parent/botEditor");
                    }}
                  >
                    <IconSymbol
                      name="plus.circle.fill"
                      color={iconColor}
                      size={40}
                      style={styles.settingsIcon}
                    ></IconSymbol>
                  </PlatformPressable>
                ),
              }}
            />
            <Stack.Screen
              name="parent/setPin"
              options={{
                headerShown: true,
                title: "Set Pin",
                headerTintColor: textColor,
              }}
            />            
            <Stack.Screen
              name="parent/botEditor"
              options={{
                headerShown: true,
                headerTintColor: textColor,
              }}
            />
            <Stack.Screen name="+not-found" />
          </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center"
  },
  settingsIcon: { 
    marginRight: 5
  }
});