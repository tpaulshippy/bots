import { StyleSheet, View, FlatList } from "react-native";
import { Link, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";

import { formatDistance, format } from 'date-fns';
import { useEffect, useState } from "react";
import { fetchChats, Chat } from "@/api/chats";

type ChatsByDay = {
  [key: string]: Chat[];
};

function getRelativeDate(inputDate: string): string {
  try {
    return formatDistance(new Date(inputDate), new Date(), { addSuffix: true });
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

  const groupByDay = (data: Chat[]): ChatsByDay => {
    return data.reduce((groups: any, record: Chat) => {
      const date = new Date(record.modified_at);
      const day = format(date, 'yyyy-MM-dd');
  
      if (!groups[day]) {
        groups[day] = [];
      }
      groups[day].push(record);
      return groups;
    }, {});
  };
  
  
  useEffect(() => {
    fetchChats().then((data) => {
      const groupedData = groupByDay(data);
      setChats(groupedData);
    });
  }, []);


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
        renderItem={({ item }) => (
          <View>
          <ThemedText style={styles.header}>{getRelativeDate(item[0])}</ThemedText>
          {item[1].map((record) => (
            <PlatformPressable key={record.id} onPress={() => handleChatPress(record)}>
              <ThemedText key={record.id} style={[styles.item, 
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
