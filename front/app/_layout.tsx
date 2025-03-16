import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import "react-native-reanimated";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StyleSheet, View } from "react-native";
import {
  useRouter,
  Stack,
  usePathname,
  useNavigationContainerRef,
} from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Image } from "expo-image";
import * as Sentry from "@sentry/react-native";
import { fetchChat } from "@/api/chats";
import { fetchBots } from "@/api/bots";
import { UnauthorizedError } from "@/api/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { clearUser, setTokens } from "@/api/tokens";
import { isRunningInExpoGo } from "expo";
import * as WebBrowser from "expo-web-browser";
import { fetchProfiles } from "@/api/profiles";
import Config, { DefaultAppName } from "@/app/config";

const appName = process.env.EXPO_PUBLIC_APP_NAME;
const config = Config()[appName || DefaultAppName];

// Initialize Sentry
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // enableSpotlight: __DEV__,
  integrations: [
    // Pass integration
    navigationIntegration,
  ],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "tint");
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const ref = useNavigationContainerRef();

  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  const navigateToChat = (chatId: string, title: string) => {
    if (pathname === "/chat") {
      router.replace({
        pathname: "/chat",
        params: { chatId, title },
      });
    } else {
      router.push({
        pathname: "/chat",
        params: { chatId, title },
      });
    }
  };

  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener(async (notification) => {});

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const chat = await fetchChat(
            response.notification.request.content.data.chat_id
          );
          if (!chat) {
            return;
          }
          if (chat.profile.profile_id) {
            await AsyncStorage.setItem(
              "selectedProfile",
              JSON.stringify(chat.profile)
            );
          }

          navigateToChat(chat.chat_id, chat.bot?.name || chat.title);
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

  const getJWTFromLink = async (event?: any) => {
    const url = event?.url;
    if (url) {
      const { queryParams } = Linking.parse(url);

      if (queryParams && queryParams.access && queryParams.refresh) {
        const access = queryParams.access as string;
        const refresh = queryParams.refresh as string;
        await setTokens({ access, refresh });
        WebBrowser.dismissBrowser();

        router.replace("/");
        await initialNavigationChecks();
      }
    }
  };

  const setProfile = async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    const profiles = await fetchProfiles();
    if (profileData) {
      const profile = JSON.parse(profileData);
      const profileExists = profiles?.results.some(
        (p) => p.profile_id === profile.profile_id
      );
      if (!profileExists) {
        await AsyncStorage.removeItem("selectedProfile");
        if (profiles && profiles.count > 0) {
          await AsyncStorage.setItem(
            "selectedProfile",
            JSON.stringify(profiles.results[0])
          );
        }
      }
    }
  }

  const initialNavigationChecks = async () => {
    try {
      await fetchBots();
      await setProfile();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await clearUser();
        router.replace("/login");
      }
    }
  };

  useEffect(() => {
    if (loaded) {
      const initialize = async () => {
        SplashScreen.hideAsync();
        Linking.addEventListener("url", getJWTFromLink);
        await initialNavigationChecks();
      };

      initialize();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ErrorBoundary>
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
              headerBackVisible: false,
              headerShown: true,
              headerTitle() {
                return (
                  <View style={styles.headerContainer}>
                    <config.headerComponent />
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
            name="parent/subscription"
            options={{
              headerShown: true,
              headerTintColor: textColor,
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              headerShown: true,
              headerTitle() {
                return (
                  <View style={styles.headerContainer}>
                    <config.headerComponent />
                  </View>
                );
              },
              headerBackVisible: false,
            }}
          />
          <Stack.Screen
            name="parent/terms"
            options={{
              headerShown: true,
              headerTintColor: textColor,
            }}
          />
          <Stack.Screen
            name="parent/deleteAccount"
            options={{
              headerShown: true,
              headerTintColor: textColor,
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ErrorBoundary>
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
