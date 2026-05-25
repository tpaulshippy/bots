import { ThemedView } from "@/components/ThemedView";
import ChatList from "./chatList";
import { StyleSheet } from "react-native";

export default function ChatHistory() {
  return (
    <ThemedView style={styles.container}>
      <ChatList />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
