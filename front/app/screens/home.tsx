import { StyleSheet, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";

import ChatList from "./chatList";

export default function Home() {
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
