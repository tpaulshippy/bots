import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedButton } from "@/components/ThemedButton";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react-native";

import { fetchStats, ProfileStats } from "@/api/stats";
import { getSelectedProfileId, handleUnauthorized, subscribeToSelectedProfile } from "@/hooks/useSelectedProfile";

// Single-letter weekday for the 7-day activity bars (UTC, matching the API).
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const weekdayLetter = (isoDate: string): string => {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return WEEKDAY_LETTERS[Number.isNaN(day) ? 0 : day] ?? "";
};

const weekdayName = (isoDate: string): string => {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return WEEKDAY_NAMES[Number.isNaN(day) ? -1 : day] ?? isoDate;
};

const pluralize = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

export default function Stats() {
  const router = useRouter();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Profile switches fire refresh() from both focus and the profile
  // listener: only the latest request may commit, so a slow response for
  // the previous kid can't overwrite the current one.
  const requestRef = useRef(0);
  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const iconColor = useThemeColor({}, "icon");
  const accentColor = useThemeColor({ dark: "#00a4c9" }, "tint");

  const refresh = useCallback(async () => {
    const requestId = (requestRef.current += 1);
    const isCurrent = () => requestId === requestRef.current;
    setRefreshing(true);
    setLoadError(false);
    try {
      const profileId = await getSelectedProfileId();
      if (!isCurrent()) return;
      if (!profileId) {
        setStats(null);
        return;
      }
      const data = await fetchStats(profileId);
      if (!isCurrent()) return;
      // A successful empty profile returns a zeroed object, never null —
      // null here means the request failed, so show the error state.
      if (data === null) {
        setLoadError(true);
      }
      setStats(data);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(true);
      if (!(await handleUnauthorized(error, router))) {
        Sentry.captureException(error);
      }
    } finally {
      if (!isCurrent()) return;
      setRefreshing(false);
      setLoading(false);
    }
  }, [router]);

  // Same staleness as the chat list had: the header/drawer switcher doesn't
  // blur/focus this screen, so refetch when the selected profile changes.
  // The previous kid's stats are cleared first so they are never shown
  // under the new profile while its request is in flight.
  useEffect(
    () =>
      subscribeToSelectedProfile(() => {
        requestRef.current += 1;
        setStats(null);
        setLoading(true);
        void refresh();
      }),
    [refresh]
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <ThemedView style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.activityIndicator} />
      ) : stats ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <StatsCard
            stats={stats}
            cardBackground={cardBackground}
            borderColor={borderColor}
            iconColor={iconColor}
            accentColor={accentColor}
          />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <ThemedText style={styles.emptyText}>
            {loadError ? "Couldn't load stats" : "No stats yet"}
          </ThemedText>
          <ThemedText style={styles.emptySubtext}>
            {loadError
              ? "Check your connection and try again"
              : "Chat or study today to start a streak"}
          </ThemedText>
          <ThemedButton
            testID="stats-retry-button"
            style={styles.retryButton}
            lightColor="#00000008"
            darkColor="#ffffff14"
            onPress={refresh}
          >
            <ThemedText type="defaultSemiBold">Retry</ThemedText>
          </ThemedButton>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const MAX_BAR_HEIGHT = 36;

function StatsCard({
  stats,
  cardBackground,
  borderColor,
  iconColor,
  accentColor,
}: {
  stats: ProfileStats;
  cardBackground: string;
  borderColor: string;
  iconColor: string;
  accentColor: string;
}) {
  const todayStatus = stats.studied_today
    ? stats.chatted_today
      ? "Chatted + studied today 🎉"
      : "Studied today ✓"
    : stats.chatted_today
      ? "Chatted today ✓"
      : stats.current_streak > 0
        ? "Keep the streak going — chat or study today!"
        : "Chat or study today to start one!";
  const totals = stats.week.map((d) => d.messages + d.reviews);
  const maxTotal = Math.max(1, ...totals);

  return (
    <View
      testID="stats-card"
      style={[
        styles.statsCard,
        { backgroundColor: cardBackground, borderColor },
      ]}
    >
      <View style={styles.statsTopRow}>
        <ThemedText testID="stats-streak" style={styles.statsStreak}>
          🔥{" "}
          {stats.current_streak > 0
            ? `${stats.current_streak}-day streak`
            : "No streak yet"}
        </ThemedText>
        <ThemedText
          testID="stats-today-badge"
          style={[styles.statsToday, { color: iconColor }]}
        >
          {todayStatus}
        </ThemedText>
      </View>
      <ThemedText testID="stats-totals" style={[styles.statsTotals, { color: iconColor }]}>
        {pluralize(stats.total_reviews, "review")} ·{" "}
        {pluralize(stats.total_chats, "chat")} ·{" "}
        {pluralize(stats.total_messages, "message")}
        {stats.longest_streak > 0
          ? ` · best ${stats.longest_streak}`
          : ""}
      </ThemedText>
      <View testID="stats-week" style={styles.statsWeek}>
        {stats.week.map((day, index) => {
          const total = totals[index] ?? 0;
          const isToday = index === stats.week.length - 1;
          return (
            <View
              key={day.date}
              style={styles.statsDay}
              accessible
              accessibilityLabel={`${weekdayName(day.date)}: ${pluralize(day.messages, "message")}, ${pluralize(day.reviews, "review")}${isToday ? ", today" : ""}`}
            >
              <View
                style={[
                  styles.statsBar,
                  {
                    height: 4 + (total / maxTotal) * MAX_BAR_HEIGHT,
                    backgroundColor: accentColor,
                    opacity: total > 0 ? (isToday ? 1 : 0.55) : 0.18,
                  },
                ]}
              />
              <ThemedText
                style={[
                  styles.statsDayLetter,
                  { color: iconColor },
                  isToday && { fontWeight: "700" as const },
                ]}
              >
                {weekdayLetter(day.date)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 10,
  },
  statsCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statsTopRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  statsStreak: {
    fontSize: 18,
    fontWeight: "700",
  },
  statsToday: {
    fontSize: 12,
  },
  statsTotals: {
    fontSize: 13,
    marginTop: 4,
  },
  statsWeek: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },
  statsDay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  statsBar: {
    width: 14,
    borderRadius: 4,
  },
  statsDayLetter: {
    fontSize: 11,
    marginTop: 4,
  },
  activityIndicator: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#888",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
