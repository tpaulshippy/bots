import React, { useState } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { FlexAlignType, Image, TouchableOpacity, Modal } from "react-native";
import { ChatMessage as ApiChatMessage } from "@/api/chats";
import { ActivityIndicator } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { IconSymbol } from "@/components/ui/IconSymbol";

interface ChatMessageProps {
  message: ApiChatMessage;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const assistantColor = useThemeColor({ light: "#bbb", dark: "#222"}, "background");
  const [modalVisible, setModalVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState('');

  const handleLongPress = () => {
    if (!message.image_url) return;

    setFullScreenImage(message.image_url);
    setModalVisible(true);
  };

  return (
    <ThemedView>
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
        <TouchableOpacity onLongPress={handleLongPress}>
          <Image source={{ uri: message.image_url }} style={styles.image} />
        </TouchableOpacity>
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
