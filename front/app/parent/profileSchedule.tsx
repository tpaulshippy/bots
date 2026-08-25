/**
 * Per-profile schedule editor (roadmap-09).
 *
 * Screen: /parent/profileSchedule?profileId=…&title=…
 *
 * v1 UI: single global start/end time + day checkboxes.
 */
import { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  fetchProfileSchedule,
  updateProfileSchedule,
  ProfileSchedule as ScheduleData,
  ScheduleWindow,
} from "@/api/profiles";
import * as Sentry from "@sentry/react-native";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun–Sat
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Preset helpers */
function schoolNightsPreset(): ScheduleWindow[] {
  // Sun–Thu 07:00–20:00
  return [0, 1, 2, 3, 4].map((dow) => ({
    dow,
    start: "07:00",
    end: "20:00",
  }));
}

function weekendsOpenPreset(): ScheduleWindow[] {
  return [5, 6].map((dow) => ({
    dow,
    start: "07:00",
    end: "22:00",
  }));
}

/** Merge windows from UI state into a single window set */
function buildWindows(
  enabledDays: boolean[],
  startTime: string,
  endTime: string,
): ScheduleWindow[] {
  const windows: ScheduleWindow[] = [];
  enabledDays.forEach((on, dow) => {
    if (on) windows.push({ dow, start: startTime, end: endTime });
  });
  return windows;
}

/** Decompose a ScheduleData into day booleans + shared start/end */
function decomposeWindows(
  windows: ScheduleWindow[],
): { days: boolean[]; start: string; end: string } {
  const days = [false, false, false, false, false, false, false];
  let start = "07:00";
  let end = "20:00";
  for (const w of windows) {
    if (w.dow >= 0 && w.dow <= 6) {
      days[w.dow] = true;
      start = w.start;
      end = w.end;
    }
  }
  return { days, start, end };
}

export default function ProfileScheduleEditor() {
  const navigation = useNavigation();
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileId: string;
    title: string;
  }>();
  const profileId = local.profileId ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState<boolean[]>([
    false,
    true,
    true,
    true,
    true,
    true,
    false,
  ]); // Mon–Fri default
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("20:00");
  const [blockMessage, setBlockMessage] = useState(
    "It's outside your chat hours. Try again later or ask a parent.",
  );

  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "cardBackground");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sched = await fetchProfileSchedule(profileId);
        if (cancelled || !sched) return;
        setEnabled(sched.enabled);
        setBlockMessage(sched.block_message);
        if (sched.windows.length > 0) {
          const { days: d, start, end } = decomposeWindows(sched.windows);
          setDays(d);
          setStartTime(start);
          setEndTime(end);
        }
      } catch (e) {
        Sentry.captureException(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const toggleDay = (idx: number) => {
    setDays((prev) => {
      const copy = [...prev];
      copy[idx] = !copy[idx];
      return copy;
    });
  };

  const applyPreset = (preset: "school" | "weekends" | "custom") => {
    if (preset === "school") {
      setEnabled(true);
      setDays([true, true, true, true, true, true, true]);
      setStartTime("07:00");
      setEndTime("20:00");
    } else if (preset === "weekends") {
      setEnabled(true);
      setDays([false, false, false, false, false, true, true]);
      setStartTime("07:00");
      setEndTime("22:00");
    } else {
      // custom: turn on all days as starting point
      setDays([true, true, true, true, true, true, true]);
    }
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const windows = enabled ? buildWindows(days, startTime, endTime) : [];
      await updateProfileSchedule(profileId, {
        enabled,
        windows,
        block_message: blockMessage,
      });
      router.back();
    } catch (e) {
      Sentry.captureException(e);
    } finally {
      setSaving(false);
    }
  }, [enabled, days, startTime, endTime, blockMessage, profileId, router]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          {local.title ?? "Schedule"}
        </ThemedText>

        {/* Enable toggle */}
        <ThemedView style={styles.row}>
          <ThemedText style={styles.label}>Limit chat hours</ThemedText>
          <Switch
            testID="schedule-enabled"
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: tintColor }}
          />
        </ThemedView>

        {enabled && (
          <>
            {/* Presets */}
            <ThemedView style={styles.presetRow}>
              <Pressable
                testID="preset-school"
                style={[styles.presetBtn, { borderColor: tintColor }]}
                onPress={() => applyPreset("school")}
              >
                <ThemedText style={styles.presetText}>School Nights</ThemedText>
              </Pressable>
              <Pressable
                testID="preset-weekends"
                style={[styles.presetBtn, { borderColor: tintColor }]}
                onPress={() => applyPreset("weekends")}
              >
                <ThemedText style={styles.presetText}>
                  Weekends Open
                </ThemedText>
              </Pressable>
              <Pressable
                testID="preset-custom"
                style={[styles.presetBtn, { borderColor: tintColor }]}
                onPress={() => applyPreset("custom")}
              >
                <ThemedText style={styles.presetText}>Custom</ThemedText>
              </Pressable>
            </ThemedView>

            {/* Day toggles */}
            <ThemedView style={styles.daysRow}>
              {DAY_LABELS.map((label, idx) => (
                <Pressable
                  key={idx}
                  testID={`day-${idx}`}
                  style={[
                    styles.dayBtn,
                    days[idx] && { backgroundColor: tintColor },
                  ]}
                  onPress={() => toggleDay(idx)}
                >
                  <ThemedText
                    style={[
                      styles.dayBtnText,
                      days[idx] && { color: "#fff" },
                    ]}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              ))}
            </ThemedView>

            {/* Time inputs */}
            <ThemedView style={styles.timeRow}>
              <ThemedView style={styles.timeField}>
                <ThemedText style={styles.timeLabel}>Start</ThemedText>
                <ThemedTextInput
                  testID="schedule-start"
                  style={styles.timeInput}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="07:00"
                />
              </ThemedView>
              <ThemedView style={styles.timeField}>
                <ThemedText style={styles.timeLabel}>End</ThemedText>
                <ThemedTextInput
                  testID="schedule-end"
                  style={styles.timeInput}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="20:00"
                />
              </ThemedView>
            </ThemedView>

            {/* Block message */}
            <ThemedView style={styles.field}>
              <ThemedText style={styles.timeLabel}>
                Message when blocked
              </ThemedText>
              <ThemedTextInput
                testID="schedule-block-message"
                style={styles.messageInput}
                value={blockMessage}
                onChangeText={setBlockMessage}
                multiline
              />
            </ThemedView>
          </>
        )}

        {/* Save */}
        <ThemedButton
          testID="schedule-save"
          darkColor="#0a7ea4"
          style={styles.saveButton}
          onPress={save}
          disabled={saving}
        >
          <ThemedText style={styles.saveButtonText}>
            {saving ? "Saving…" : "Save"}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { padding: 20 },
  title: { textAlign: "center", marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  label: { fontSize: 16 },
  presetRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  presetBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetText: { fontSize: 13 },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#999",
    justifyContent: "center",
    alignItems: "center",
  },
  dayBtnText: { fontSize: 14, fontWeight: "600" },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  timeField: { flex: 1, marginHorizontal: 4 },
  timeLabel: { fontSize: 14, marginBottom: 4 },
  timeInput: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  field: { marginBottom: 16 },
  messageInput: {
    height: 60,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    textAlignVertical: "top",
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center" as const,
    marginTop: 10,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
