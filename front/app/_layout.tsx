import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  useNavigationState,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Drawer } from "expo-router/drawer";
import { useColorScheme } from "@/hooks/useColorScheme";
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

  const childStackRouteName = useNavigationState((state) => {
    const stackNavigator = state.routes.find((r) => r.name === 'child');
    const name = stackNavigator?.state?.routes?.[stackNavigator?.state?.index]?.name;
    return name;
  });
  const parentStackRouteName = useNavigationState((state) => {
    const stackNavigator = state.routes.find((r) => r.name === 'parent');
    const name = stackNavigator?.state?.routes?.[stackNavigator?.state?.index]?.name;
    return name;
  });
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Drawer
          screenOptions={() => {
            const childRouteName = childStackRouteName;
            const parentRouteName = parentStackRouteName;
            return {
             headerShown: childRouteName !== "chat" && parentRouteName !== "screens/chat",
             headerTintColor: "#BBB",
            }
          }
        }
        >
          <Drawer.Screen
            name="child"
            options={{
              drawerLabel: "Home",
              title: "",
              drawerItemStyle: { display: user ? "flex" : "none" },
            }}
          />
          <Drawer.Screen
            name="parent"
            options={{
              drawerLabel: "Settings",
              title: "Settings",
              drawerItemStyle: { display: user ? "flex" : "none" },
            }}
          />
          <Drawer.Screen
            name="screens/login"
            options={{
              drawerLabel: "Login",
              title: "Login",
              drawerItemStyle: { display: user ? "none" : "flex" },
            }}
          />
          <Drawer.Screen
            name="+not-found"
            options={{
              drawerLabel: "Not Found",
              title: "Not Found",
              drawerItemStyle: { display: "none" },
            }}
          />
          <Drawer.Screen
            name="index"
            options={{
              drawerItemStyle: { display: "none" },
            }}
          />
        </Drawer>
      </GestureHandlerRootView>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
