import { useState, useEffect, useRef } from "react";
import { Text, View, Button, Platform, StyleSheet, Switch } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useLocalSearchParams } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  upsertDevice,
  Device as DeviceData,
  fetchDevice,
  setDeviceIdInStorage,
  getDeviceIdFromStorage,
} from "@/api/devices";

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
  const [device, setDevice] = useState(null as DeviceData | null);
  const local = useLocalSearchParams();
  useEffect(() => {
    const handleNotifications = async () => {
      if (enableNotifications) {
        const token = await registerForPushNotificationsAsync();

        if (token) {
          let newDevice;
          if (!device) {
            newDevice = {
              id: -1,
              device_id: "",
              notification_token: token,
              notify_on_new_chat: false,
              notify_on_new_message: true,
              deleted_at: null,
            };
          } else {
            newDevice = { ...device };
          }
          newDevice.notify_on_new_chat = false;
          newDevice.notify_on_new_message = true;
          setDevice(newDevice);
          newDevice = await upsertDevice(newDevice);
          setDeviceIdInStorage(newDevice.device_id);
        }
      } else if (device) {
        device.notify_on_new_chat = false;
        device.notify_on_new_message = false;
        await upsertDevice(device);
      }
    };

    handleNotifications();
  }, [enableNotifications]);

  useEffect(() => {
    if (local.notification) {
      setNotification(JSON.parse(local.notification as string));
    }

    const setupDevice = async () => {
      const deviceId = await getDeviceIdFromStorage();
      if (!deviceId) {
        return;
      }
      let currentDevice = await fetchDevice(deviceId);
      if (currentDevice) {
        if (currentDevice.notify_on_new_message) {
          setEnableNotifications(true);
        }
        setDevice(currentDevice);
      }
    };
    setupDevice();

  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
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
    margin: 10,
  },
  formGroupCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    padding: 5,
  },
  checkboxLabel: {
    fontSize: 16,
    marginLeft: 10,
  },
});
