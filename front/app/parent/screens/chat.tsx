import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, FlexAlignType } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams } from 'expo-router';

import { fetchChatMessages, sendChat, ChatMessage } from "@/api/chats";

const ITEM_HEIGHT = 50;

export default function Chat() {
  const local = useLocalSearchParams();
  const [chatId, setChatId] = useState<string>();
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const chatId = local.chatId.toString();
    if (chatId) {
      setChatId(chatId);

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

  const getBotId = async () => {
    const botData = await AsyncStorage.getItem("selectedBot");
    if (botData) {
      const bot = JSON.parse(botData);
      return bot.bot_id;
    }
    return null;
  };

  const sendChatToServer = async () => {
    const inputText = input.trim();
    setInput("");
    const profileId = await getProfileId();
    const botId = await getBotId();
    if (!profileId) {
      const newAssistantMessage: ChatMessage = {
        role: "assistant",
        text: "Please select a profile first.",
      };
      setMessages([newAssistantMessage]);
      return;
    }

    const newUserMessage: ChatMessage = { role: "user", text: inputText };
    const loadingMessage: ChatMessage = { role: "assistant", isLoading: true, text: "..." };

    setMessages([...messages, newUserMessage, loadingMessage]);


    const chatResponse = await sendChat(chatId, inputText, profileId, botId);
    if (chatResponse) {
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
          inverted
          style={styles.list}
          data={[...messages].reverse()}
          renderItem={({ item }) => (
            item.isLoading ? <ActivityIndicator /> :
            <ThemedText
              selectable={true}
              style={
                item.role == "user"
                  ? styles.userMessage
                  : styles.assistantMessage
              }
            >
              {item.text}
            </ThemedText>
          )}
          getItemLayout={(data, index) => (
            {length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index}
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
  },
  list: {
    padding: 20
  },
  input: {
    height: 40,
    margin: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    backgroundColor: "#222",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  userMessage: {
    backgroundColor: "#2fd05a",
    padding: 10,
    margin: 10,
    borderRadius: 10,
    alignSelf: 'flex-end' as FlexAlignType
  },
  assistantMessage: {
    backgroundColor: "#333",
    padding: 10,
    margin: 10,
    borderRadius: 10,
    alignSelf: 'flex-start' as FlexAlignType
  },
};
