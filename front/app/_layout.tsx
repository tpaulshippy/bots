import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import {
  useRouter,
  Stack,
  usePathname,
  useNavigationContainerRef,
} from "expo-router";
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
import { NavigationDrawer } from "@/components/NavigationDrawer";

// Initialize Sentry
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
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
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const navigateToChat = useCallback((chatId: string, title: string) => {
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
  }, [pathname, router]);

  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener(async () => {});

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          const data = response.notification.request.content.data as { chat_id?: string };
          if (!data?.chat_id) {
            return;
          }
          const chat = await fetchChat(data.chat_id);
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
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [navigateToChat]);

  const setProfile = useCallback(async () => {
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
  }, []);

  const initialNavigationChecks = useCallback(async () => {
    try {
      await fetchBots();
      await setProfile();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await clearUser();
        router.replace("/login");
      } else {
        console.error("Initialization error:", error);
        Sentry.captureException?.(error);
      }
    }
  }, [router, setProfile]);

  const getJWTFromLink = useCallback(async (event?: any) => {
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
  }, [initialNavigationChecks, router]);

  useEffect(() => {
    if (loaded) {
      const subscription = Linking.addEventListener("url", getJWTFromLink);

      const initialize = async () => {
        try {
          await initialNavigationChecks();
        } catch (error) {
          console.error("Fatal initialization error:", error);
          Sentry.captureException?.(error);
        } finally {
          setInitializing(false);
          await SplashScreen.hideAsync();
        }
      };

      void initialize();

      // Safety timeout: never block the UI for more than 15 seconds
      const safetyTimeout = setTimeout(() => {
        setInitializing(false);
        SplashScreen.hideAsync().catch(() => {});
      }, 15000);

      return () => {
        subscription.remove();
        clearTimeout(safetyTimeout);
      };
    }
  }, [getJWTFromLink, initialNavigationChecks, loaded]);

  if (!loaded || initializing) {
    // Return a view matching splash screen background to prevent black screen
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ErrorBoundary>
        <View style={{ flex: 1 }}>
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
                headerLeft: () => (
                  <Pressable
                    onPress={() => setIsDrawerOpen(true)}
                  >
                    <IconSymbol
                      name="line.3.horizontal"
                      color={iconColor}
                      size={40}
                      style={styles.menuIcon}
                    ></IconSymbol>
                  </Pressable>
                ),
            }}
          />
           <Stack.Screen
            name="chat"
            options={{
              headerShown: true,
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => router.replace("/chatHistory")}
                >
                  <IconSymbol
                    name="chevron.backward"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
            }}
          />
           <Stack.Screen
            name="chatHistory"
            options={{
              headerShown: true,
              title: "Chats",
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => setIsDrawerOpen(true)}
                >
                  <IconSymbol
                    name="line.3.horizontal"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
            }}
          />
             <Stack.Screen
            name="flashcards"
            options={{
              headerShown: true,
              title: "Flashcards",
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => setIsDrawerOpen(true)}
                >
                  <IconSymbol
                    name="line.3.horizontal"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
            }}
          />
          <Stack.Screen
            name="flashcards/deck"
            options={{
              headerShown: true,
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => router.push("/flashcards")}
                >
                  <IconSymbol
                    name="chevron.backward"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
            }}
          />
          <Stack.Screen
            name="flashcards/cardEdit"
            options={{
              headerShown: true,
              title: "Edit Card",
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => router.back()}
                >
                  <IconSymbol
                    name="chevron.backward"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
            }}
          />
          <Stack.Screen
            name="flashcards/study"
            options={{
              headerShown: true,
              title: "Study",
              headerTintColor: textColor,
              headerLeft: () => (
                <Pressable
                  onPress={() => router.back()}
                >
                  <IconSymbol
                    name="chevron.backward"
                    color={iconColor}
                    size={40}
                    style={styles.menuIcon}
                  ></IconSymbol>
                </Pressable>
              ),
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
                <Pressable
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
                </Pressable>
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
                    <Image
                      source={require("../assets/images/syft_small.png")}
                      style={{ width: 260, height: 35 }}
                    />
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
        <NavigationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        />
        <StatusBar style="auto" />
        </View>
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
  menuIcon: {
    marginLeft: 5,
  },
  settingsIcon: {
    marginRight: 5,
  },
});
