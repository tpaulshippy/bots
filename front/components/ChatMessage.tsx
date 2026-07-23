import React, { useState } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ActivityIndicator, FlexAlignType, Image, Modal, TouchableOpacity } from "react-native";
import { ChatMessage as ApiChatMessage } from "@/api/chats";
import { useThemeColor } from "@/hooks/useThemeColor";
import { IconSymbol } from "@/components/ui/IconSymbol";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { format } from "date-fns";

interface ChatMessageProps {
  message: ApiChatMessage & { created_at?: string };
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const assistantColor = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const userColor = useThemeColor({ light: "#03465b", dark: "#0a7ea4" }, "tint");
  const timestampColor = useThemeColor({}, "icon");
  const isUser = message.role === "user";
  const [modalVisible, setModalVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState('');

  const handleLongPress = () => {
    if (!message.image_url) return;

    setFullScreenImage(message.image_url);
    setModalVisible(true);
  };

  return (
    <ThemedView testID={`chat-message-${message.role}`}>
      <Modal
        visible={modalVisible}
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Image source={{ uri: fullScreenImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}>
            <IconSymbol name="xmark" size={24} color="#fff" />
          </TouchableOpacity>
        </ThemedView>
      </Modal>
      {message.image_url && (
        <TouchableOpacity onLongPress={handleLongPress} testID="chat-message-image">
          <Image source={{ uri: message.image_url }} style={styles.image} testID="chat-message-image-source" />
        </TouchableOpacity>
      )}
      {message.isLoading && <ActivityIndicator style={styles.loading} />}
      {message.text && (
        isUser ? (
          <ThemedText
            selectable={true}
            style={styles.userMessage(userColor)}
          >
            {message.text}
          </ThemedText>
        ) : (
          <ThemedView style={styles.assistantMessage(assistantColor, borderColor)}>
            <MarkdownRenderer content={message.text} />
          </ThemedView>
        )
      )}
      {message.created_at && (
        <ThemedText style={styles.timestamp(isUser, timestampColor)}>
          {format(new Date(message.created_at), "p")}
        </ThemedText>
      )}
    </ThemedView>
  );
};

const styles = {
  userMessage: (userColor: string) => {
    return {
      backgroundColor: userColor,
      color: "#fff",
      padding: 10,
      margin: 10,
      borderRadius: 10,
      alignSelf: "flex-end" as FlexAlignType,
      maxWidth: "85%" as const,
    };
  },
  assistantMessage: (assistantColor: string, borderColor: string) => {
    return {
      backgroundColor: assistantColor,
      borderColor: borderColor,
      borderWidth: 1,
      padding: 10,
      margin: 10,
      borderRadius: 10,
      alignSelf: "flex-start" as FlexAlignType,
      maxWidth: "85%" as const,
    };
  },
  timestamp: (isUser: boolean, color: string) => {
    return {
      fontSize: 11,
      color: color,
      alignSelf: (isUser ? "flex-end" : "flex-start") as FlexAlignType,
      marginHorizontal: 12,
      marginTop: -6,
      marginBottom: 6,
    };
  },
  loading: {
    alignSelf: "flex-start" as FlexAlignType,
    margin: 10,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginVertical: 5,
    alignSelf: "flex-end" as FlexAlignType,
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    paddingLeft: 10,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
};

export default ChatMessage;
