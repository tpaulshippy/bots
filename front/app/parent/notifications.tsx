import { useState, useEffect, useRef } from "react";
import { Platform, StyleSheet, Switch, View } from "react-native";
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
  const [notifyOnNewChat, setNotifyOnNewChat] = useState(false);
  const [notifyOnNewMessage, setNotifyOnNewMessage] = useState(false);
  // Digest-only suppresses the two immediate flags at send time on the
  // backend; in the UI it disables them so the parent sees what wins.
  const [notifyDigestOnly, setNotifyDigestOnly] = useState(false);
  const deviceRef = useRef<DeviceData | null>(null);

  const updateDeviceState = (nextDevice: DeviceData | null) => {
    deviceRef.current = nextDevice;
  };

  useEffect(() => {
    const setupDevice = async () => {
      const deviceId = await getDeviceIdFromStorage();
      if (!deviceId) {
        return;
      }
      const currentDevice = await fetchDevice(deviceId);
      if (currentDevice) {
        setNotifyOnNewChat(currentDevice.notify_on_new_chat);
        setNotifyOnNewMessage(currentDevice.notify_on_new_message);
        setNotifyDigestOnly(currentDevice.notify_digest_only);
        updateDeviceState(currentDevice);
      }
    };
    void setupDevice();
  }, []);

  const persistFlags = async (
    next: Pick<
      DeviceData,
      "notify_on_new_chat" | "notify_on_new_message" | "notify_digest_only"
    >
  ) => {
    let current = deviceRef.current;
    if (!current) {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        return;
      }
      const existingDevice = await fetchDeviceByToken(token);
      current =
        existingDevice ??
        ({
          id: -1,
          device_id: "",
          notification_token: token,
          notify_on_new_chat: false,
          notify_on_new_message: false,
          notify_digest_only: false,
          deleted_at: null,
        } as DeviceData);
    }

    const updatedDevice: DeviceData = {
      ...current,
      notify_on_new_chat: next.notify_on_new_chat,
      notify_on_new_message: next.notify_on_new_message,
      notify_digest_only: next.notify_digest_only,
    };
    const saved = await upsertDevice(updatedDevice);
    if (saved) {
      setDeviceIdInStorage(saved.device_id);
      updateDeviceState(saved);
    }
  };

  const toggleNewChat = (value: boolean) => {
    setNotifyOnNewChat(value);
    void persistFlags({
      notify_on_new_chat: value,
      notify_on_new_message: notifyOnNewMessage,
      notify_digest_only: notifyDigestOnly,
    });
  };

  const toggleNewMessage = (value: boolean) => {
    setNotifyOnNewMessage(value);
    void persistFlags({
      notify_on_new_chat: notifyOnNewChat,
      notify_on_new_message: value,
      notify_digest_only: notifyDigestOnly,
    });
  };

  const toggleDigestOnly = (value: boolean) => {
    setNotifyDigestOnly(value);
    void persistFlags({
      notify_on_new_chat: notifyOnNewChat,
      notify_on_new_message: notifyOnNewMessage,
      notify_digest_only: value,
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <ThemedText style={styles.checkboxLabel}>Notify on new chat</ThemedText>
        <Switch
          testID="notify-new-chat-switch"
          value={notifyOnNewChat}
          disabled={notifyDigestOnly}
          onValueChange={toggleNewChat}
        />
      </ThemedView>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <ThemedText style={styles.checkboxLabel}>
          Notify on each message
        </ThemedText>
        <Switch
          testID="notify-new-message-switch"
          value={notifyOnNewMessage}
          disabled={notifyDigestOnly}
          onValueChange={toggleNewMessage}
        />
      </ThemedView>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <View style={styles.labelContainer}>
          <ThemedText style={styles.checkboxLabel}>Daily digest only</ThemedText>
          <ThemedText style={styles.hintLabel}>
            One summary a day instead of instant pushes
          </ThemedText>
        </View>
        <Switch
          testID="notify-digest-only-switch"
          value={notifyDigestOnly}
          onValueChange={toggleDigestOnly}
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
    marginBottom: 8,
  },
  checkboxLabel: {
    fontSize: 16,
    marginLeft: 10,
    flexShrink: 1,
  },
  labelContainer: {
    flexShrink: 1,
    flexDirection: "column",
  },
  hintLabel: {
    fontSize: 12,
    marginLeft: 10,
    opacity: 0.6,
  },
});
