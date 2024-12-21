import { StyleSheet, View, FlatList, RefreshControl } from "react-native";
import { Link, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDistance, format, toDate } from 'date-fns';
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from '@react-navigation/native';

import { fetchChats, Chat } from "@/api/chats";

type ChatsByDay = {
  [key: string]: Chat[];
};

function getRelativeDate(inputDate: string): string {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const dayInput = format(new Date(inputDate), 'yyyy-MM-dd');

    if (dayInput == today) {
      return "Today";
    }
    const relativeDate = formatDistance(new Date(inputDate), new Date(), { addSuffix: true });
    if (relativeDate === "1 day ago") {
      return "Yesterday";
    }
    return relativeDate;
  }
  catch (error) {
    console.error("Failed to format the date: " + inputDate, error);
    return "";
  }
}

export default function ChatList() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatsByDay>({});
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
  
  const refresh = async () => {
    setRefreshing(true);
    try {
      const profileId = await getProfileId();
      const data = await fetchChats(profileId);
      setChats(groupByDay(data));
    } catch (error) {
      console.error("Failed to fetch chats", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );
  
  const handleChatPress = async (chat: Chat) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedChat(chat);
    router.push(`/screens/chat?chatId=${chat.chat_id}`);
  }

    return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer} type="title">
        Chats
      </ThemedText>
      <View style={styles.addButton}>
        <Link href="/screens/chat">
          <IconSymbol name="text.bubble" color="black"></IconSymbol>
        </Link>
      </View>

      <FlatList
        style={styles.list}
        data={Object.entries(chats)}
        keyExtractor={(item) => item[0]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        renderItem={({ item }) => (
          <View>
          <ThemedText style={styles.header}>{item[0]}</ThemedText>
          {item[1].map((record) => (
            <PlatformPressable key={record.id} onPress={() => handleChatPress(record)}>
              <ThemedText 
              key={record.id} 
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.item, 
                selectedChat?.id === record.id && styles.selectedItem
              ]}>
                {record.title}
              </ThemedText>
            </PlatformPressable>
          ))}
        </View>
        )}
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
    color: "#888",
    padding: 6
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
    marginTop: 40,
  },
  list: {
    marginHorizontal: 10,
  },
  addButton: {
    position: "absolute",
    bottom: 60,
    right: 30,
    backgroundColor: "darkgray",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 15,
  },
});
