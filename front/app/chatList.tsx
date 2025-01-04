import { StyleSheet, View, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDistance, format } from "date-fns";
import { useCallback, useEffect, useState } from "react";

import { fetchChats, Chat } from "@/api/chats";
import { UnauthorizedError } from "@/api/apiClient";
import { PlatformPressable } from "@react-navigation/elements";


type ChatsByDay = {
  [key: string]: Chat[];
};

function getRelativeDate(inputDate: string): string {
  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const dayInput = format(new Date(inputDate), "yyyy-MM-dd");

    if (dayInput == today) {
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
    console.error("Failed to format the date: " + inputDate, error);
    return "";
  }
}

export default function ChatList() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatsByDay>({});
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

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

  const getProfileId = async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    if (profileData) {
      const profile = JSON.parse(profileData);
      return profile.profile_id;
    }
    return null;
  };

  const refresh = async (nextPage: number) => {
    setRefreshing(true);
    try {
      const profileId = await getProfileId();
      const data = await fetchChats(profileId, nextPage);
      setChats(prevChats => {
        const newChats = groupByDay(data.results);
        if (page === 1) {
          return newChats;
        } 
        // else {
        //   // Merge new chats with previous chats
        //   const mergedChats = { ...prevChats };
        //   Object.entries(newChats).forEach(([day, chats]) => {
        //     if (!mergedChats[day]) {
        //       mergedChats[day] = [];
        //     }
        //     mergedChats[day] = [...mergedChats[day], ...chats];
        //   });
        //   return mergedChats;
        // }
      });
      setHasMore(data.next !== null);
      setRefreshing(false);
      setLoadingMore(false);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        router.push("/login");
      }
      console.error("Failed to fetch chats", error);    
    }
  };

  useFocusEffect(
    useCallback(() => {
      resetRefresh();
    }, [])
  );


  const resetRefresh = () => {
    setPage(1);
    setChats({});
    refresh(1);
  };

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
    router.push(`/chat`);
  }

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      setPage(prevPage => {
        const nextPage = prevPage + 1;
        refresh(nextPage);
        return nextPage;
      });
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.addButton}>
        <PlatformPressable onPress={handleNewChatPress}>
          <IconSymbol name="text.bubble" color="black"></IconSymbol>
        </PlatformPressable>
      </View>

      <FlatList
        style={styles.list}
        data={Object.entries(chats)}
        keyExtractor={(item) => item[0]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={resetRefresh} />
        }
        renderItem={({ item }) => (
          <View>
            <ThemedText style={styles.header}>{item[0]}</ThemedText>
            {item[1].map((record: Chat) => (
              <PlatformPressable
                key={record.id}
                onPress={() => handleChatPress(record)}
              >
                <ThemedText
                  key={record.id}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    styles.item
                  ]}
                >
                  {record.title}
                </ThemedText>
              </PlatformPressable>
            ))}
          </View>
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator /> : null}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    fontSize: 12,
    color: "#888",
    padding: 6,
  },
  item: {
    padding: 8,
    fontSize: 16,
    height: 44,
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
});
