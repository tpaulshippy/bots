import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useEffect, useState } from "react";
import { ThemedButton } from "@/components/ThemedButton";
import { ActivityIndicator, FlatList, FlexAlignType } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { fetchChatMessages, sendChat, ChatMessage } from "@/api/chats";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";

const ITEM_HEIGHT = 50;

export default function Chat() {
  const assistantColor = useThemeColor({ light: "#bbb", dark: "#222"}, "background");
  const local = useLocalSearchParams();
  const [chatId, setChatId] = useState<string>();
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const chatId = local.chatId?.toString();
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
    if (!inputText) {
      return;
    }
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
    const loadingMessage: ChatMessage = {
      role: "assistant",
      isLoading: true,
      text: "...",
    };

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
          renderItem={({ item }) =>
            item.isLoading ? (
              <ActivityIndicator />
            ) : (
              <ThemedText
                selectable={true}
                style={
                  item.role == "user"
                    ? styles.userMessage
                    : styles.assistantMessage(assistantColor)
                }
              >
                {item.text}
              </ThemedText>
            )
          }
          getItemLayout={(data, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
        />
        <ThemedView style={styles.inputContainer}>
          <ThemedTextInput
            autoFocus={true}
            multiline={true}
            onChangeText={setInput}
            value={input}
            style={styles.input}
          ></ThemedTextInput>
          <ThemedButton
            style={styles.sendButton}
            onPress={sendChatToServer}
          >
            <IconSymbol
              style={styles.sendButtonIcon}
              name="arrow.up"
              color="#bbb"
              size={45}
            ></IconSymbol>
          </ThemedButton>
        </ThemedView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  container: {
    flex: 1,
  },
  list: {
    padding: 20,
  },
  inputContainer: {
    flexDirection: "row",
  },
  input: {
    flex: 4,
    minHeight: 60,
    margin: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sendButton: {
    height: 60,
    width: 60,
    marginRight: 12,
    marginVertical: 12,
    borderRadius: "50%",
    justifyContent: "center" as FlexAlignType,
    alignItems: "center" as FlexAlignType,
  },
  sendButtonIcon: {},
  userMessage: {
    backgroundColor: "#03465b",
    color: "#fff",
    padding: 10,
    margin: 10,
    borderRadius: 10,
    alignSelf: "flex-end" as FlexAlignType,
  },
  assistantMessage: (assistantColor: string) => {
    return {
      backgroundColor: assistantColor,
      padding: 10,
      margin: 10,
      borderRadius: 10,
      alignSelf: "flex-start" as FlexAlignType,
    };
  },
};
