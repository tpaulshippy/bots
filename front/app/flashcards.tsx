import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { FAB } from "@/components/FAB";
import { FormModal } from "@/components/FormModal";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import * as Sentry from "@sentry/react-native";

import { fetchDecks, createDeck, DeckListItem } from "@/api/flashcards";
import { fetchStats, ProfileStats } from "@/api/stats";
import { getSelectedProfileId, subscribeToSelectedProfile } from "@/hooks/useSelectedProfile";
import { ThemedButton } from "@/components/ThemedButton";
import { formatDistanceToNowStrict } from "date-fns";

// Guards against malformed timestamps: formatDistanceToNowStrict throws on
// Invalid Date, which would crash the whole deck list.
const formatLastStudied = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return `${formatDistanceToNowStrict(date)} ago`;
  } catch {
    return null;
  }
};

// Single-letter weekday for the 7-day activity bars (UTC, matching the API).
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const weekdayLetter = (isoDate: string): string => {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return WEEKDAY_LETTERS[Number.isNaN(day) ? 0 : day] ?? "";
};

const pluralize = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

export default function Flashcards() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const iconColor = useThemeColor({}, "icon");
  const accentColor = useThemeColor({ dark: "#00a4c9" }, "tint");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const profileId = await getSelectedProfileId();
      if (!profileId) {
        setDecks([]);
        setStats(null);
        setRefreshing(false);
        return;
      }
      const data = await fetchDecks(profileId);
      setDecks(data.results || []);
      setStats(await fetchStats(profileId));
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Same staleness as the chat list had: the header/drawer switcher doesn't
  // blur/focus this screen, so refetch when the selected profile changes.
  useEffect(() => subscribeToSelectedProfile(() => refresh()), [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      Alert.alert("Error", "Please enter a deck name");
      return;
    }
    try {
      const profileId = await getSelectedProfileId();
      if (!profileId) {
        Alert.alert("Error", "No profile found");
        return;
      }
      const result = await createDeck(newDeckName.trim(), newDeckDescription.trim(), profileId);
      if (result) {
        setShowCreateModal(false);
        setNewDeckName("");
        setNewDeckDescription("");
        refresh();
      } else {
        Sentry.captureException(new Error("Failed to create deck: null response"));
        Alert.alert("Error", "Failed to create deck");
      }
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to create deck");
    }
  };

  const handleDeckPress = (deck: DeckListItem) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/flashcards/deck",
      params: { deckId: deck.deck_id, title: deck.name },
    });
  };

  if (showCreateModal) {
    return (
      <FormModal
        title="Create New Deck"
        fields={[
          {
            placeholder: "Deck name",
            value: newDeckName,
            onChangeText: setNewDeckName,
          },
          {
            placeholder: "Description (optional)",
            value: newDeckDescription,
            onChangeText: setNewDeckDescription,
            multiline: true,
            height: 80,
          },
        ]}
        submitLabel="Create"
        onSubmit={handleCreateDeck}
        onCancel={() => {
          setShowCreateModal(false);
          setNewDeckName("");
          setNewDeckDescription("");
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FAB icon="plus" onPress={() => setShowCreateModal(true)} />

      {loading ? (
        <ActivityIndicator style={styles.activityIndicator} />
      ) : (
        <>
          {stats ? (
            <StatsCard
              stats={stats}
              cardBackground={cardBackground}
              borderColor={borderColor}
              iconColor={iconColor}
              accentColor={accentColor}
            />
          ) : null}
          <FlatList
          style={styles.list}
          data={decks}
          keyExtractor={(item) => item.deck_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          renderItem={({ item }) => {
            const lastStudied = formatLastStudied(item.last_studied_at);
            return (
              <Pressable
                testID={`deck-row-${item.deck_id}`}
                style={[
                  styles.itemContainer,
                  { backgroundColor: cardBackground, borderColor },
                ]}
                onPress={() => handleDeckPress(item)}
              >
                <IconSymbol
                  name="square.grid.2x2.fill"
                  size={28}
                  color={accentColor}
                  style={styles.deckIcon}
                />
                <View style={styles.itemContent}>
                  <ThemedText style={styles.deckName} numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  {item.description ? (
                    <ThemedText
                      style={[styles.description, { color: iconColor }]}
                      numberOfLines={1}
                    >
                      {item.description}
                    </ThemedText>
                  ) : null}
                  {lastStudied ? (
                    <ThemedText
                      style={[styles.lastStudied, { color: iconColor }]}
                      numberOfLines={1}
                    >
                      Last studied {lastStudied}
                    </ThemedText>
                  ) : null}
                </View>
              {(item.due_count ?? 0) > 0 ? (
                <View
                  testID={`deck-due-badge-${item.deck_id}`}
                  style={[styles.countBadge, { backgroundColor: "#e0525226" }]}
                >
                  <ThemedText style={[styles.dueBadgeText, { color: "#d9534f" }]}>
                    {item.due_count} due
                  </ThemedText>
                </View>
              ) : null}
              <View
                style={[styles.countBadge, { backgroundColor: accentColor + "26" }]}
              >
                <ThemedText style={[styles.countBadgeText, { color: accentColor }]}>
                  {item.card_count} cards
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={iconColor} />
            </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol
                name="square.grid.2x2.fill"
                size={48}
                color={iconColor}
              />
              <ThemedText style={styles.emptyText}>
                No decks yet
              </ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Decks can be created from chats, or tap + to create one
              </ThemedText>
              {!loading && (
                <ThemedButton
                  testID="flashcards-empty-chat-link"
                  style={styles.emptyChatLink}
                  lightColor="#00000008"
                  darkColor="#ffffff14"
                  onPress={() => router.push("/chatHistory")}
                >
                  <ThemedText type="defaultSemiBold">Go to chats</ThemedText>
                </ThemedButton>
              )}
            </View>
          }
        />
        </>
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
        {stats.longest_streak > stats.current_streak
          ? ` · best ${stats.longest_streak}`
          : ""}
      </ThemedText>
      <View testID="stats-week" style={styles.statsWeek}>
        {stats.week.map((day, index) => {
          const total = totals[index] ?? 0;
          const isToday = index === stats.week.length - 1;
          return (
            <View key={day.date} style={styles.statsDay}>
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
  list: {
    flex: 1,
    marginHorizontal: 10,
  },
  statsCard: {
    marginHorizontal: 10,
    marginTop: 12,
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
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  deckIcon: {
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  deckName: {
    fontSize: 16,
    fontWeight: "600",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dueBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  lastStudied: {
    fontSize: 12,
    marginTop: 4,
  },
  description: {
    fontSize: 14,
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
    paddingTop: 100,
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
  emptyChatLink: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
});