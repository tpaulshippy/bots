import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useEffect, useState } from "react";
import { fetchChatMessages, sendChat, ChatMessage } from "@/api/chats";
import { ActivityIndicator, FlatList } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams } from 'expo-router';


export default function Chat() {
  const local = useLocalSearchParams();
  const [chatId, setChatId] = useState<string>();
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Read the chatId from the URL
  useEffect(() => {
    const chatId = local.chatId;
    if (chatId) {
      setChatId(chatId);

      // Fetch the chat messages
      fetchChatMessages(chatId).then((data) => {
        setMessages(data);
      });
    }
  }, []);

  const getProfileId = async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    if (profileData) {
      const profile = JSON.parse(profileData);
      return profile.profile_id;
    }
    return null;
  };

  const sendChatToServer = async () => {
    const profileId = await getProfileId();
    if (!profileId) {
      const newAssistantMessage: ChatMessage = {
        role: "assistant",
        text: "Please select a profile first.",
      };
      setMessages([newAssistantMessage]);
      return;
    }

    const newUserMessage: ChatMessage = { role: "user", text: input };
    const loadingMessage: ChatMessage = { role: "assistant", isLoading: true, text: "..." };

    setMessages([...messages, newUserMessage, loadingMessage]);


    const chatResponse = await sendChat(chatId, input, profileId);
    if (chatResponse) {
      setInput("");
      const newAssistantMessage: ChatMessage = {
        role: "assistant",
        text: chatResponse.response,
      };
      setMessages([...messages, newUserMessage, newAssistantMessage]);
      setChatId(chatResponse.chat_id);

    }
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
          renderItem={({ item }) => (
            item.isLoading ? <ActivityIndicator /> :
            <ThemedText
              style={
                item.role == "user"
                  ? styles.userMessage
                  : styles.assistantMessage
              }
            >
              {item.text}
            </ThemedText>
          )}
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
    padding: 10,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    backgroundColor: "#222", // Added background color
    shadowColor: "#000", // Added shadow for better appearance
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2, // Added elevation for Android shadow
  },
  userMessage: {
    backgroundColor: "#2fd05a",
    padding: 10,
    margin: 10,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
  assistantMessage: {
    backgroundColor: "#333",
    padding: 10,
    margin: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
};
