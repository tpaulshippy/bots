import PinWrapper from "@/components/PinWrapper";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  fetchActivityChats,
  fetchActivitySummary,
  ActivityChatItem,
  ActivitySummary,
} from "@/api/activity";
import { getAccount } from "@/api/account";
import { handleUnauthorized } from "@/hooks/useSelectedProfile";
import { useThemeColor } from "@/hooks/useThemeColor";
import { format, formatDistance } from "date-fns";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";

function formatRowTime(inputDate: string | null): string {
  if (!inputDate) return "";
  try {
    const date = new Date(inputDate);
    if (format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) {
      return format(date, "p");
    }
    return formatDistance(date, new Date(), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function ActivityScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [correctPin, setCorrectPin] = useState<string>("");
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [chats, setChats] = useState<ActivityChatItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [safetyOnly, setSafetyOnly] = useState(false);
  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const secondaryColor = useThemeColor({}, "icon");

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!isRefresh) setLoading(true);
      setRefreshing(isRefresh);
      try {
        const [summaryData, chatData] = await Promise.all([
          fetchActivitySummary(7),
          fetchActivityChats({
            profileId: selectedProfileId,
            hasSafetyEvent: safetyOnly ? true : null,
          }),
        ]);
        if (summaryData) setSummary(summaryData);
        if (chatData) setChats(chatData.results);
      } catch (error) {
        if (!(await handleUnauthorized(error, router))) {
          throw error;
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, selectedProfileId, safetyOnly]
  );

  useEffect(() => {
    getAccount().then((account) => {
      // Empty PIN leaves PinWrapper open; a seeded PIN gates the inbox.
      setCorrectPin(account?.pin?.toString() || "");
    });
  }, []);

  useEffect(() => {
    void load(false);
    // Reload whenever a filter changes.
  }, [load]);

  const toggleProfileFilter = (profileId: string) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedProfileId((current) => (current === profileId ? null : profileId));
  };

  const openTranscript = (chat: ActivityChatItem) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/parent/activityChat",
      params: {
        chatId: chat.chat_id,
        title: `${chat.profile.name} · ${chat.bot?.name || chat.title}`,
      },
    });
  };

  const renderChatRow = ({ item, index }: { item: ActivityChatItem; index: number }) => (
    <Pressable
      testID={`activity-chat-row-${index}`}
      accessibilityLabel={`Open transcript for ${item.profile.name}`}
      style={[styles.card, { backgroundColor: cardBackground, borderColor }]}
      onPress={() => openTranscript(item)}
    >
      <ThemedView style={styles.cardTopRow}>
        <ThemedText numberOfLines={1} style={styles.cardTitle}>
          {item.profile.name} · {item.bot?.name || "Unknown bot"}
        </ThemedText>
        <ThemedText style={[styles.cardTime, { color: secondaryColor }]}>
          {formatRowTime(item.last_message_at)}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.cardBottomRow}>
        <ThemedText
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.cardPreview, { color: secondaryColor }]}
        >
          {item.last_message_preview ? `"${item.last_message_preview}"` : item.title}
        </ThemedText>
        {item.safety_event_count > 0 && (
          <ThemedView
            testID="activity-shield-badge"
            accessibilityLabel="Has safety events"
          >
            <IconSymbol name="shield.fill" size={16} color="#FF9500" />
          </ThemedView>
        )}
      </ThemedView>
    </Pressable>
  );

  return (
    <PinWrapper correctPin={correctPin}>
      <ThemedView testID="activity-screen" style={styles.container}>
        <ThemedText style={styles.sectionHeader}>This week</ThemedText>
        {loading ? (
          <ThemedView style={styles.loadingContainer}>
            <ActivityIndicator testID="activity-loading" />
          </ThemedView>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsRow}
              testID="activity-summary-chips"
            >
              {(summary?.profiles ?? []).map((profile) => (
                <Pressable
                  key={profile.profile_id}
                  testID={`activity-summary-chip-${profile.profile_id}`}
                  accessibilityLabel={`Filter by ${profile.name}`}
                  onPress={() => toggleProfileFilter(profile.profile_id)}
                  style={[
                    styles.chip,
                    { borderColor },
                    selectedProfileId === profile.profile_id && [
                      styles.chipSelected,
                      { backgroundColor: cardBackground },
                    ],
                  ]}
                >
                  <ThemedText style={styles.chipText}>
                    {profile.name} {profile.chat_count}
                  </ThemedText>
                  {profile.safety_event_count > 0 && (
                    <IconSymbol name="shield.fill" size={12} color="#FF9500" />
                  )}
                </Pressable>
              ))}
              <Pressable
                testID="activity-safety-filter"
                accessibilityLabel="Only chats with safety events"
                onPress={() => setSafetyOnly((value) => !value)}
                style={[
                  styles.chip,
                  { borderColor },
                  safetyOnly && [styles.chipSelected, { backgroundColor: cardBackground }],
                ]}
              >
                <ThemedText style={styles.chipText}>🛡 Safety</ThemedText>
              </Pressable>
            </ScrollView>
            <FlatList
              testID="activity-list"
              data={chats}
              keyExtractor={(chat) => chat.chat_id}
              renderItem={renderChatRow}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void load(true)}
                />
              }
              contentContainerStyle={chats.length === 0 ? styles.emptyContainer : undefined}
              ListEmptyComponent={
                <ThemedView testID="activity-empty-state" style={styles.emptyState}>
                  <IconSymbol name="text.bubble" size={48} color={secondaryColor} />
                  <ThemedText style={styles.emptyTitle}>No chats yet</ThemedText>
                  <ThemedText style={[styles.emptyHint, { color: secondaryColor }]}>
                    Conversations your kids have will appear here
                  </ThemedText>
                </ThemedView>
              }
            />
          </>
        )}
      </ThemedView>
    </PinWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingTop: 8,
    opacity: 0.7,
  },
  chipsRow: {
    flexGrow: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipSelected: {
    borderColor: "#03465b",
  },
  chipText: {
    fontSize: 13,
    marginRight: 4,
  },
  card: {
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  cardTime: {
    fontSize: 12,
    marginLeft: 8,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardPreview: {
    fontSize: 13,
    flexShrink: 1,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
