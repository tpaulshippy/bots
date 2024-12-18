import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useState } from "react";
import { sendChat } from "@/api/chats";
import { FlatList } from "react-native";
import { KeyboardAvoidingView, Platform } from "react-native";

export default function Chat() {
  const [chatId, setChatId] = useState<string>();
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);

  const sendChatToServer = () => {
    sendChat(chatId, input).then((chatResponse) => {
      if (chatResponse) {
        setInput("");
        setMessages([...messages, input, chatResponse.response]);
        setChatId(chatResponse.chat_id);
      }
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ThemedView style={styles.container}>
        <FlatList
          style={styles.list}
          data={messages}
          renderItem={({ item }) => <ThemedText>{item}</ThemedText>}
        />
        <ThemedTextInput
          autoFocus={true}
          onChangeText={setInput}
          value={input}
          onSubmitEditing={sendChatToServer}
          style={styles.input}
        ></ThemedTextInput>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 20,
    height: "80%",
  },
  input: {
    height: 40,
    width: "90%",
    margin: 12,
    borderWidth: 1,
    borderColor: "white",
  },
};
