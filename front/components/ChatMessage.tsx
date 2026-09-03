import React, { useState } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ActivityIndicator, FlexAlignType, Image, Modal, TouchableOpacity } from "react-native";
import { AgentActivity, ChatMessage as ApiChatMessage } from "@/api/chats";
import { useThemeColor } from "@/hooks/useThemeColor";
import { IconSymbol } from "@/components/ui/IconSymbol";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { format } from "date-fns";

interface ChatMessageProps {
  message: ApiChatMessage & { created_at?: string };
  onRetry?: () => void;
  // True while this assistant message is still streaming. Partial
  // markdown can emit bare text nodes on web, so render plain text
  // until the stream completes and full markdown is safe.
  isStreaming?: boolean;
}

const chipLabel = (event: AgentActivity): string => {
  switch (event.kind) {
    case "deck":
      return `📇 Created “${event.name}” · ${event.cardCount} cards`;
    default:
      return event.label;
  }
};

const ChatMessage = ({ message, onRetry, isStreaming }: ChatMessageProps) => {
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
      {!isUser && (message.agentEvents?.length ?? 0) > 0 && (
        <ThemedView style={styles.agentChips}>
          {message.agentEvents!.map((event, index) => (
            <ThemedView
              key={`${event.kind}-${index}`}
              testID={`agent-chip-${event.kind === "deck" ? "deck" : event.kind === "sources" ? "search" : "tool"}`}
              style={styles.agentChip}
            >
              <ThemedText style={styles.agentChipText}>{chipLabel(event)}</ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      )}
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
            {isStreaming && !isUser ? (
              <ThemedText selectable={true}>{message.text}</ThemedText>
            ) : (
              <MarkdownRenderer content={message.text} />
            )}
          </ThemedView>
        )
      )}
      {message.failed && onRetry && (
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={onRetry}>
          <ThemedText style={styles.retryText}>↻ Retry</ThemedText>
        </TouchableOpacity>
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
  agentChips: {
    flexDirection: "row" as "row",
    flexWrap: "wrap" as "wrap",
    marginHorizontal: 10,
    marginTop: 4,
    gap: 6,
  },
  agentChip: {
    borderWidth: 1,
    borderColor: "#0a7ea4",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
    maxWidth: "85%" as const,
  },
  agentChipText: {
    fontSize: 13,
    color: "#0a7ea4",
  },
  retryButton: {
    alignSelf: "flex-start" as FlexAlignType,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#d9534f",
    borderRadius: 14,
  },
  retryText: {
    color: "#d9534f",
    fontSize: 14,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginVertical: 5,
    alignSelf: "flex-end" as FlexAlignType,
  },
  closeButton: {
    position: "absolute" as const,
    top: 40,
    right: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
