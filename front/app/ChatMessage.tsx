import React from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { FlexAlignType, Image } from "react-native";
import { ChatMessage as ApiChatMessage } from "@/api/chats";
import { ActivityIndicator } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

interface ChatMessageProps {
  message: ApiChatMessage;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const assistantColor = useThemeColor({ light: "#bbb", dark: "#222"}, "background");

  return (
    <ThemedView>
      {message.image_url && (
        <Image source={{ uri: message.image_url }} style={styles.image} />
      )}
      {message.isLoading && <ActivityIndicator />}
      {message.text && (
        <ThemedText
          selectable={true}
          style={
            message.role === "user"
              ? styles.userMessage
              : styles.assistantMessage(assistantColor)
        }
      >
        {message.text}
      </ThemedText>
      )}
    </ThemedView>
  );
};

const styles = {
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
  image: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginVertical: 5,
    alignSelf: "flex-end" as FlexAlignType,
  },
};

export default ChatMessage;
