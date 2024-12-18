import { StyleSheet, FlatList, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useEffect, useState } from "react";
import { fetchChats, Chat } from "@/api/chats";

export default function ChatList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const showList = false;

  useEffect(() => {
    fetchChats().then((data) => {
      setChats(data);
    });
  }, []);

  return (
    <FlatList
      style={styles.list}
      data={chats}
      renderItem={({ item }) => (
        <ThemedText key={item.chat_id}>{item.title}</ThemedText>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    paddingLeft: 20,
    marginTop: 40,
  },
  list: {
    padding: 20,
  },
  addButton: {
    position: "absolute",
    bottom: 60, // Adjust spacing from bottom
    right: 30, // Adjust spacing from right
    backgroundColor: "darkgray",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },
});
