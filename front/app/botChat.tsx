import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { useEffect, useState } from "react";
import { ThemedButton } from "@/components/ThemedButton";
import { ActivityIndicator, FlatList, FlexAlignType, Keyboard } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from 'expo-image-picker';

import { fetchChatMessages, sendChat, ChatMessage as ApiChatMessage } from "@/api/chats";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import ChatMessage from '@/app/ChatMessage';

const ITEM_HEIGHT = 50;

export default function Chat() {
  const local = useLocalSearchParams();
  const [chatId, setChatId] = useState<string>();
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ApiChatMessage[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [image, setImage] = useState<string | null>(null);

  const refresh = async (nextPage: number) => {
    const chatIdQueryString = local.chatId?.toString();
    if (chatIdQueryString) {
      setChatId(chatIdQueryString);

      fetchChatMessages(chatIdQueryString, nextPage).then((data) => {
        setMessages([...messages, ...data.results]);
        setHasMore(data.next !== null);
        setLoadingMore(false);
      });
    }
  };

  useEffect(() => {
    refresh(page);
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

  const handleImagePicker = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      alert('Permission to access camera is required!');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });
    if (pickerResult && !pickerResult.canceled) {
      const fileUri = pickerResult.assets[0].uri;
      setImage(fileUri);
    }
  };

  const sendChatToServer = async () => {
    const inputText = input.trim();
    if (!inputText && !image) {
      return;
    }
    setInput("");
    Keyboard.dismiss();
    const profileId = await getProfileId();
    const botId = await getBotId();
    if (!profileId) {
      const newAssistantMessage: ApiChatMessage = {
        role: "assistant",
        image_url: null,
        text: "Please select a profile first.",
      };
      setMessages([newAssistantMessage]);
      return;
    }

    const newUserMessage: ApiChatMessage = { 
      role: "user", 
      image_url: image,
      text: inputText 
    };
    const loadingMessage: ApiChatMessage = {
      role: "assistant",
      image_url: null,
      isLoading: true,
      text: "",
    };

    setMessages([...messages, newUserMessage, loadingMessage]);

    const formData = new FormData();
    formData.append('message', inputText);
    if (image) {
      const fileUri = image;
      const fileType = fileUri.split('.').pop();
      formData.append('image', {
        uri: fileUri,
        name: `image.${fileType}`,
        type: `image/${fileType}`,
      });
    }
    formData.append('profile', profileId);
    formData.append('bot', botId);

    const chatResponse = await sendChat(chatId, formData);
    if (chatResponse) {
      const newAssistantMessage: ApiChatMessage = {
        role: "assistant",
        image_url: null,
        text: chatResponse.response,
      };
      setMessages([...messages, newUserMessage, newAssistantMessage]);
      setChatId(chatResponse.chat_id);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && local.chatId) {
      setLoadingMore(true);
      setPage(prevPage => {
        const nextPage = prevPage + 1;
        refresh(nextPage);
        return nextPage;
      });
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
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => <ChatMessage message={item} />}
          getItemLayout={(data, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          onStartReached={handleLoadMore}
          onStartReachedThreshold={0.5}
          ListHeaderComponent={loadingMore ? <ActivityIndicator /> : null}
        />
        <ThemedView style={styles.inputContainer}>
          <ThemedTextInput
            autoFocus={!local.chatId}
            multiline={true}
            onChangeText={setInput}
            value={input}
            style={styles.input}
          ></ThemedTextInput>
          <ThemedButton
            style={styles.sendButton}
            onPress={handleImagePicker}
          >
            <IconSymbol
              style={styles.sendButtonIcon}
              name="camera.fill"
              color="#bbb"
              size={45}
            ></IconSymbol>
          </ThemedButton>
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
    flexDirection: "row" as "row",
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
  sendButtonIcon: {}
};
