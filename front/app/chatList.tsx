import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDistance, format } from "date-fns";
import { useCallback, useState } from "react";
import * as Sentry from "@sentry/react-native";

import { fetchChats, Chat } from "@/api/chats";
import { UnauthorizedError } from "@/api/apiClient";
import { clearUser } from "@/api/tokens";

type ChatsByDay = {
  [key: string]: Chat[];
};

const AVATAR_COLORS = [
  "#5B8DEF",
  "#8E6BC8",
  "#4FA38A",
  "#D07A5A",
  "#C25E7E",
  "#5E9C6B",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getRelativeDate(inputDate: string): string {
  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const dayInput = format(new Date(inputDate), "yyyy-MM-dd");

    if (dayInput === today) {
      return "Today";
    }
    const relativeDate = formatDistance(new Date(inputDate), new Date(), {
      addSuffix: true,
    });
    if (relativeDate === "1 day ago") {
      return "Yesterday";
    }
    return relativeDate;
  } catch (error) {
    Sentry.captureException(error);
    return "";
  }
}

export default function ChatList() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatsByDay>({});
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const secondaryColor = useThemeColor({}, "icon");

  const groupByDay = (data: Chat[]): ChatsByDay => {
    return data.reduce((groups: any, record: Chat) => {
      const day = getRelativeDate(record.modified_at);

      if (!groups[day]) {
        groups[day] = [];
      }
      groups[day].push(record);
      return groups;
    }, {});
  };

  const getProfileId = useCallback(async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    if (profileData) {
      const profile = JSON.parse(profileData);
      return profile.profile_id;
    }
    return null;
  }, []);

  const refresh = useCallback(async (nextPage: number): Promise<boolean> => {
    setRefreshing(true);
    try {
      const profileId = await getProfileId();
      const data = await fetchChats(profileId, nextPage);
      if (!data || data.results.length === 0) {
        setHasMore(false);
        setRefreshing(false);
        return false;
      }
      setChats((prevChats) => {
        const newChats = groupByDay(data.results);
        if (nextPage === 1) {
          return newChats;
        } else {
          const mergedChats = { ...prevChats };
          Object.entries(newChats).forEach(([day, chats]) => {
            if (!mergedChats[day]) {
              mergedChats[day] = [];
            }
            mergedChats[day] = [...mergedChats[day], ...chats];
          });
          return mergedChats;
        }
      });
      setHasMore(data.next !== null && data.next !== undefined);
      setRefreshing(false);
      return true;
    } catch (error) {
      console.log("Caught error in chatList")
      console.log(error);
      setRefreshing(false);
      if (error instanceof UnauthorizedError) {
        await clearUser();
        router.replace("/login");
      }
      return false;
    }
  }, [getProfileId, router]);

  const resetRefresh = useCallback(() => {
    setPage(1);
    setChats({});
    void refresh(1);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      resetRefresh();
    }, [resetRefresh])
  );

  const handleChatPress = async (chat: Chat) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: `/chat`,
      params: { chatId: chat.chat_id, title: chat.bot?.name || chat.title },
    });
  };

  const handleNewChatPress = () => {
    router.push({ pathname: `/chat`, params: { newChat: "true" } });
  };

  const handleLoadMore = () => {
    if (!refreshing && hasMore) {
      const nextPage = page + 1;
      void refresh(nextPage).then((ok) => {
        if (ok) {
          setPage(nextPage);
        }
      });
    }
  };

  const isEmpty = Object.keys(chats).length === 0;

  return (
    <ThemedView style={styles.container}>
      <Pressable
        style={styles.addButton}
        onPress={handleNewChatPress}
        accessibilityLabel="Start new chat"
      >
        <IconSymbol name="text.bubble" color="black"></IconSymbol>
      </Pressable>

      <FlatList
        style={styles.list}
        contentContainerStyle={isEmpty ? styles.emptyContainer : undefined}
        data={Object.entries(chats)}
        keyExtractor={(item) => item[0]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={resetRefresh} />
        }
        renderItem={({ item }) => (
          <View>
            <ThemedText style={[styles.header, { color: secondaryColor }]}>
              {item[0]}
            </ThemedText>
            {item[1].map((record: Chat) => {
              const avatarName = record.bot?.name || record.title || "?";
              return (
                <Pressable
                  key={record.id}
                  style={[
                    styles.card,
                    { backgroundColor: cardBackground, borderColor },
                  ]}
                  onPress={() => handleChatPress(record)}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: getAvatarColor(avatarName) },
                    ]}
                  >
                    <ThemedText style={styles.avatarText}>
                      {avatarName.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.cardBody}>
                    <ThemedText
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={styles.title}
                    >
                      {record.title}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.subtitle, { color: secondaryColor }]}
                    >
                      {record.bot?.name}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          refreshing ? null : (
            <View style={styles.emptyState}>
              <IconSymbol name="text.bubble" size={48} color={secondaryColor} />
              <ThemedText style={styles.emptyTitle}>No chats yet</ThemedText>
              <ThemedText style={[styles.emptyHint, { color: secondaryColor }]}>
                Tap the chat button to start one
              </ThemedText>
            </View>
          )
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={refreshing ? <ActivityIndicator style={styles.activityIndicator} /> : null}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    fontSize: 12,
    padding: 6,
    marginTop: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  selectedItem: {
    borderRadius: 8,
    backgroundColor: "#444",
  },
  titleContainer: {
    flexDirection: "row",
    paddingLeft: 10,
  },
  list: {
    marginHorizontal: 10,
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
  addButton: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: "#03465b",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 15,
  },
  activityIndicator: {
    margin: 10,
  },
});
