import { useState, useEffect, useRef } from "react";
import { Platform, StyleSheet, Switch } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  upsertDevice,
  Device as DeviceData,
  fetchDevice,
  fetchDeviceByToken,
  setDeviceIdInStorage,
  getDeviceIdFromStorage,
} from "@/api/devices";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
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
  const bgColor = useThemeColor({}, "cardBackground");
  const [enableNotifications, setEnableNotifications] = useState(false);
  const deviceRef = useRef<DeviceData | null>(null);

  const updateDeviceState = (nextDevice: DeviceData | null) => {
    deviceRef.current = nextDevice;
  };

  useEffect(() => {
    const handleNotifications = async () => {
      if (enableNotifications) {
        const token = await registerForPushNotificationsAsync();

        if (token) {
          const existingDevice = await fetchDeviceByToken(token);

          if (existingDevice) {
            // Update existing device
            existingDevice.notify_on_new_chat = false;
            existingDevice.notify_on_new_message = true;
            await upsertDevice(existingDevice);
            setDeviceIdInStorage(existingDevice.device_id);
            updateDeviceState(existingDevice);
          } else {
            // Create new device
            let newDevice: DeviceData = {
              id: -1,
              device_id: "",
              notification_token: token,
              notify_on_new_chat: false,
              notify_on_new_message: true,
              deleted_at: null,
            };
            const createdDevice = await upsertDevice(newDevice);
            if (createdDevice) {
              setDeviceIdInStorage(createdDevice.device_id);
              updateDeviceState(createdDevice);
            }
          }
        }
      } else if (deviceRef.current) {
        const updatedDevice = {
          ...deviceRef.current,
          notify_on_new_chat: false,
          notify_on_new_message: false,
        };
        await upsertDevice(updatedDevice);
        updateDeviceState(updatedDevice);
      }
    };

    void handleNotifications();
  }, [enableNotifications]);

  useEffect(() => {
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
        updateDeviceState(currentDevice);
      }
    };
    void setupDevice();

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
