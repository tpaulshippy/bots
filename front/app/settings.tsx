import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { MenuItem } from "@/components/MenuItem";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  upsertDevice,
  Device as DeviceData,
  fetchDevice,
  fetchDeviceByToken,
  setDeviceIdInStorage,
  getDeviceIdFromStorage,
} from "@/api/devices";
import { registerForPushNotificationsAsync } from "./parent/notifications";
import { clearUser } from "@/api/tokens";

// Keep these URLs in sync with app/parent/terms.tsx (same documents,
// exposed here so teen-delegated sessions — blocked from /parent/* — can
// still read them).
const TERMS_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL =
  "https://www.freeprivacypolicy.com/live/6f20c0b8-408b-481d-a474-d3f589746d7b";

/**
 * Teen-accessible Settings (no PIN gate).
 *
 * The full parent settings live behind the PIN at /parent/settings and are
 * unreachable from teen-delegated sessions (drawer hides them, route guard
 * bounces deep links). Study reminders are the teen's own opt-in — they are
 * the ones who need the nudge — so this screen exposes ONLY notify_study_due.
 * Parent surveillance flags (new chat / each message / digest-only) stay
 * parent-only and are preserved untouched on save (read-modify-write).
 */
export default function SettingsScreen() {
  const bgColor = useThemeColor({}, "cardBackground");
  const actionColor = useThemeColor({ dark: "#00a4c9" }, "tint");
  const router = useRouter();
  const [notifyStudyDue, setNotifyStudyDue] = useState(false);
  // Digest-only suppresses study reminders at send time on the backend. Teens
  // can't change it here (parent-only flag) — surface it read-only so the
  // disabled switch isn't a mystery.
  const [digestOnly, setDigestOnly] = useState(false);
  const deviceRef = useRef<DeviceData | null>(null);

  useEffect(() => {
    const load = async () => {
      const deviceId = await getDeviceIdFromStorage();
      if (!deviceId) {
        return;
      }
      const current = await fetchDevice(deviceId);
      if (current) {
        setNotifyStudyDue(current.notify_study_due ?? false);
        setDigestOnly(current.notify_digest_only);
        deviceRef.current = current;
      }
    };
    void load();
  }, []);

  const persistStudyDue = async (value: boolean) => {
    let current = deviceRef.current;
    if (!current) {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        return;
      }
      const existing = await fetchDeviceByToken(token);
      current =
        existing ??
        ({
          id: -1,
          device_id: "",
          notification_token: token,
          notify_on_new_chat: false,
          notify_on_new_message: false,
          notify_digest_only: false,
          notify_study_due: false,
          deleted_at: null,
        } as DeviceData);
    }

    const saved = await upsertDevice({
      ...current,
      notify_study_due: value,
    });
    if (saved) {
      setDeviceIdInStorage(saved.device_id);
      deviceRef.current = saved;
      setDigestOnly(saved.notify_digest_only);
    }
  };

  const toggleStudyDue = (value: boolean) => {
    setNotifyStudyDue(value);
    void persistStudyDue(value);
  };

  const handleLogout = async () => {
    await clearUser();
    router.replace("/login");
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView
        style={[styles.formGroupCheckbox, { backgroundColor: bgColor }]}
      >
        <View style={styles.labelContainer}>
          <ThemedText style={styles.checkboxLabel}>Study reminders</ThemedText>
          <ThemedText style={styles.hintLabel}>
            Nudge me when flashcards are due for review
          </ThemedText>
          {digestOnly ? (
            <ThemedText style={styles.hintLabel}>
              Paused while Daily digest only is on — a parent can change that
              in parent Settings → Notifications.
            </ThemedText>
          ) : null}
        </View>
        <Switch
          testID="teen-study-due-switch"
          value={notifyStudyDue}
          disabled={digestOnly}
          onValueChange={toggleStudyDue}
        />
      </ThemedView>
      <ThemedView style={[styles.menuContainer, { backgroundColor: bgColor }]}>
        <MenuItem
          title="Terms of Use"
          iconName="questionmark.circle.fill"
          testID="teen-terms-use"
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <MenuItem
          title="Privacy Policy"
          iconName="shield.fill"
          testID="teen-privacy-policy"
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
        <MenuItem
          title="Log Out"
          iconName="arrowshape.turn.up.left.fill"
          iconColor={actionColor}
          testID="teen-log-out"
          hideChevron
          onPress={handleLogout}
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
  menuContainer: {
    borderRadius: 10,
    padding: 4,
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
