import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import {
  useRouter,
  Stack,
  useNavigationContainerRef,
  type Href,
} from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";
import { NavigationDrawer } from "@/components/NavigationDrawer";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { useNotificationChatNavigation } from "@/hooks/useNotificationChatNavigation";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { useDelegatedRouteGuard } from "@/hooks/useDelegatedRouteGuard";
import {
  BackButton,
  DrawerMenuButton,
  HeaderLogo,
} from "@/components/HeaderButtons";

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
  const colorScheme = useColorScheme();
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "tint");
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const ref = useNavigationContainerRef();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const router = useRouter();

  useNotificationChatNavigation();
  useAuthBootstrap(loaded);

  // Teen-delegated devices have no parent surfaces: deep links (or stale
  // state) pointing into /parent/* bounce to the chat screen instead.
  useDelegatedRouteGuard();

  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  if (!loaded) {
    // Only block while fonts are loading; network calls run in background
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
                headerTitle() {
                  return <HeaderLogo />;
                },
                headerLeft: () => (
                  <DrawerMenuButton onOpen={() => setIsDrawerOpen(true)} />
                ),
              }}
            />
            <Stack.Screen
              name="chat"
              options={{
                headerShown: true,
                headerTintColor: textColor,
                headerLeft: () => (
                  // Valid route; the generated typed routes are stale.
                  <BackButton onPress={() => router.replace("/chatHistory" as Href)} />
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
                  <DrawerMenuButton onOpen={() => setIsDrawerOpen(true)} />
                ),
                headerRight: () => <ProfileSwitcher />,
              }}
            />
            <Stack.Screen
              name="onboarding/index"
              options={{
                headerShown: false,
                gestureEnabled: false,
                headerBackVisible: false,
              }}
            />
            <Stack.Screen
              name="onboarding/profile"
              options={{
                headerShown: false,
                // Skip-resistant: no swipe-back off the required steps.
                gestureEnabled: false,
                headerBackVisible: false,
              }}
            />
            <Stack.Screen
              name="onboarding/bot"
              options={{
                headerShown: false,
                headerBackVisible: false,
              }}
            />
            <Stack.Screen
              name="onboarding/protect"
              options={{
                headerShown: false,
                gestureEnabled: false,
                headerBackVisible: false,
              }}
            />
            <Stack.Screen
              name="flashcards"
              options={{
                headerShown: true,
                title: "Flashcards",
                headerTintColor: textColor,
                headerLeft: () => (
                  <DrawerMenuButton onOpen={() => setIsDrawerOpen(true)} />
                ),
              }}
            />
            <Stack.Screen
              name="flashcards/deck"
              options={{
                headerShown: true,
                headerTintColor: textColor,
                headerLeft: () => (
                  // Valid route; the generated typed routes are stale.
                  <BackButton onPress={() => router.push("/flashcards" as Href)} />
                ),
              }}
            />
            <Stack.Screen
              name="flashcards/cardEdit"
              options={{
                headerShown: true,
                title: "Edit Card",
                headerTintColor: textColor,
                headerLeft: () => <BackButton onPress={() => router.back()} />,
              }}
            />
            <Stack.Screen
              name="flashcards/study"
              options={{
                headerShown: true,
                title: "Study",
                headerTintColor: textColor,
                headerLeft: () => <BackButton onPress={() => router.back()} />,
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
              name="parent/activity"
              options={{
                headerShown: true,
                title: "Activity",
                headerTintColor: textColor,
              }}
            />
            <Stack.Screen
              name="parent/activityChat"
              options={{
                headerShown: true,
                headerTintColor: textColor,
                headerLeft: () => <BackButton onPress={() => router.back()} />,
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
                animation: "none",
                headerTitle() {
                  return <HeaderLogo />;
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
  settingsIcon: {
    marginRight: 5,
  },
});
