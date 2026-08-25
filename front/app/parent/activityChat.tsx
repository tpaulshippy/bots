import ChatMessage from "@/components/ChatMessage";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import {
  ActivitySafetyEvent,
  ActivityTranscriptMessage,
  fetchActivityChat,
} from "@/api/activity";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet } from "react-native";

/**
 * Parent read-only transcript. Reuses the kid chat bubble component but has
 * no composer: parents review here, they never write into the kid thread.
 */
export default function ActivityChatScreen() {
  const params = useLocalSearchParams();
  const chatId = params.chatId?.toString();
  const [messages, setMessages] = useState<ActivityTranscriptMessage[]>([]);
  const [safetyEvents, setSafetyEvents] = useState<ActivitySafetyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const secondaryColor = useThemeColor({}, "icon");

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    fetchActivityChat(chatId).then((detail) => {
      if (cancelled) return;
      if (!detail) {
        setNotFound(true);
      } else {
        setMessages(detail.messages);
        setSafetyEvents(detail.safety_events);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // Roadmap 03 will attach message_order to safety events; markers render
  // above the blocked turn in the transcript.
  const markerByOrder = new Map<number, string>();
  for (const event of safetyEvents) {
    if (typeof event.message_order === "number" && event.summary) {
      markerByOrder.set(event.message_order, event.summary);
    }
  }

  const renderItem = ({ item }: { item: ActivityTranscriptMessage }) => (
    <ThemedView>
      {markerByOrder.has(item.order) && (
        <ThemedText testID="activity-safety-marker" style={styles.safetyMarker}>
          ⚠ {markerByOrder.get(item.order)}
        </ThemedText>
      )}
      <ChatMessage
        message={{
          text: item.text,
          image_url: item.image_url,
          role: item.role,
          created_at: item.created_at,
        }}
      />
    </ThemedView>
  );

  return (
    <ThemedView testID="activity-transcript-screen" style={styles.container}>
      {!loading && !notFound && (
        <ThemedText testID="activity-transcript-subtitle" style={[styles.subtitle, { color: secondaryColor }]}>
          Read only · {messages.length} message{messages.length === 1 ? "" : "s"}
        </ThemedText>
      )}
      {loading ? (
        <ActivityIndicator testID="activity-transcript-loading" style={styles.loading} />
      ) : notFound ? (
        <ThemedView testID="activity-transcript-missing" style={styles.emptyState}>
          <ThemedText>This conversation is unavailable.</ThemedText>
        </ThemedView>
      ) : (
        <FlatList
          testID="activity-transcript-list"
          data={messages}
          keyExtractor={(message) => message.message_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  listContent: {
    padding: 10,
  },
  safetyMarker: {
    fontSize: 12,
    color: "#B25000",
    marginHorizontal: 12,
    marginTop: 8,
  },
  loading: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
