import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StyleSheet, View } from "react-native";
import { useRouter, Stack, usePathname } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Image } from "expo-image";
import * as Sentry from "@sentry/react-native";
import { fetchChat } from "@/api/chats";
import { fetchBots } from "@/api/bots";
import { UnauthorizedError } from "@/api/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // enableSpotlight: __DEV__,
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "tint");
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener(async (notification) => {});

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const chat = await fetchChat(
            response.notification.request.content.data.chat_id
          );
          if (chat.profile.profile_id) {
            await AsyncStorage.setItem("selectedProfile", JSON.stringify(chat.profile));
          }

          if (pathname === '/chat') {
            router.replace({
              pathname: "/chat",
              params: {
                chatId: chat.chat_id,
                title: chat.bot?.name || chat.title,
                refresh: Date.now(),
              },
            });
          } else {
            router.push({
              pathname: "/chat",
              params: {
                chatId: chat.chat_id,
                title: chat.bot?.name || chat.title,
              },
            });
          }
        }
      );

    return () => {
      notificationListener.current &&
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      responseListener.current &&
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      const initialize = async () => {
        try {
          const bots = await fetchBots();
          if (bots.count === 0) {
            router.replace("/parent/initialBotSelection");
          }
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            router.push("/login");
          }
        }
        SplashScreen.hideAsync();
      };
      
      initialize();
    }
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
          title: route.params?.title || "",
        })}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: true,
            headerTitle(props) {
              return (
                <View style={styles.headerContainer}>
                  <Image
                    source={require("../assets/images/syft_small.png")}
                    style={{ width: 260, height: 35 }}
                  />
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
        <Stack.Screen
          name="parent/notifications"
          options={{
            headerShown: true,
            headerTintColor: textColor,
          }}
        />
        <Stack.Screen
          name="parent/initialBotSelection"
          options={{
            headerShown: false,
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
    alignItems: "center",
  },
  settingsIcon: {
    marginRight: 5,
  },
});
