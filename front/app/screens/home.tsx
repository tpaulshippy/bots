import { StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { IconSymbol } from "@/components/ui/IconSymbol";
import ChatList from "../screens/chatList";

export default function Home() {
  const showList = false;

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
      {showList ? <ChatList /> : null}
    </ThemedView>
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
    flex: 1,
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
