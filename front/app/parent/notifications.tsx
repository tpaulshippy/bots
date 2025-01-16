import { useState, useEffect, useRef } from "react";
import { Text, View, Button, Platform, StyleSheet, Switch } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useLocalSearchParams } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { set } from "date-fns";
import { useThemeColor } from "@/hooks/useThemeColor";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function handleRegistrationError(errorMessage: string) {
  alert(errorMessage);
  throw new Error(errorMessage);
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      handleRegistrationError(
        "Permission not granted to get push token for push notification!"
      );
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) {
      handleRegistrationError("Project ID not found");
    }
    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log(pushTokenString);
      return pushTokenString;
    } catch (e: unknown) {
      handleRegistrationError(`${e}`);
    }
  } else {
    handleRegistrationError("Must use physical device for push notifications");
  }
}

export default function NotificationsScreen() {
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);
  const bgColor = useThemeColor({}, "cardBackground");
  const [enableNotifications, setEnableNotifications] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState("");
  const local = useLocalSearchParams();

  useEffect(() => {
    if (enableNotifications) {
      registerForPushNotificationsAsync().then((token) => {
        if (token && expoPushToken)
        {
          setExpoPushToken(token);
        }
      });
      
    }
    else {
      setExpoPushToken("");
    }
  }, [enableNotifications]);

  useEffect(() => {
      if (local.notification) {
        setNotification(JSON.parse(local.notification as string));
      }
  }, []);

  

  return (
    <ThemedView
      style={styles.container}
    >
      <ThemedView style={[styles.formGroupCheckbox,
        { backgroundColor: bgColor }
      ]}>
        <ThemedText style={styles.checkboxLabel}>
          Enable Notifications
        </ThemedText>
        <Switch
          value={enableNotifications}
          onValueChange={setEnableNotifications}
        />
      </ThemedView>
    </ThemedView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formGroupCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    justifyContent: "space-between",
    borderRadius: 10,
    margin: 10
  },
  checkboxLabel: {
    fontSize: 16,
    marginLeft: 10,
  },
});