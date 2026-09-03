import { ThemedView } from "@/components/ThemedView";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedText } from "@/components/ThemedText";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  KeyboardAvoidingView,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  FlexAlignType,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedButton } from "@/components/ThemedButton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import {
  fetchChatMessages,
  sendChat,
  streamChatMessage,
  ChatMessage as ApiChatMessage,
  ChatStreamEvent,
} from "@/api/chats";
import { fetchProfiles } from "@/api/profiles";
import { IconSymbol } from "@/components/ui/IconSymbol";
import ChatMessage from '@/components/ChatMessage';
import { E2E_TEST_IMAGE_URI } from "@/e2e/utils";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  getSelectedBotId,
  getSelectedProfileId,
  setSelectedProfile,
} from "@/hooks/useSelectedProfile";

// idle -> sending -> streaming -> complete | error | aborted (roadmap doc 06 §2)
type ChatPhase = "idle" | "sending" | "streaming" | "error";

interface PendingPayload {
  text: string;
  image: string | null;
}

interface DeckToast {
  deckId: string;
  name: string;
  cardCount: number;
}

export default function Chat() {
  const local = useLocalSearchParams();
  const router = useRouter();
  const chatIdParam = local.chatId?.toString();
  const [chatId, setChatId] = useState<string | undefined>(chatIdParam);
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ApiChatMessage[]>([]);
  const [, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [deckToast, setDeckToast] = useState<DeckToast | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<PendingPayload | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputBorderColor = useThemeColor({}, "border");
  const placeholderColor = useThemeColor({}, "icon");
  const busy = phase === "sending" || phase === "streaming";

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    abortRef.current?.abort();
  }, []);

  const refresh = useCallback(async (nextPage: number) => {
    const chatIdQueryString = local.chatId?.toString();
    if (chatIdQueryString) {
      setChatId(chatIdQueryString);

      fetchChatMessages(chatIdQueryString, nextPage).then((data) => {
        if (data) {
          setMessages(prev => [...prev, ...data.results]);
          setHasMore(data.next !== null);
        }
        setLoadingMore(false);
      });
    }
  }, [local.chatId]);

  // Sync chatId with params when they change (a notification can open a
  // different chat while already on this screen) so messages are sent to
  // the chat being viewed. Adjusting state during render is the pattern
  // recommended over setState in an effect.
  if (chatIdParam && chatIdParam !== chatId) {
    setChatId(chatIdParam);
    setPage(1);
  }

  useEffect(() => {
    const chatIdQueryString = local.chatId?.toString();
    if (chatIdQueryString) {
      fetchChatMessages(chatIdQueryString, 1).then((data) => {
        if (data) {
          setMessages(data.results);
          setHasMore(data.next !== null);
        }
        setLoadingMore(false);
      });
    }
  }, [local.chatId]);

  const handleImagePicker = async () => {
    if (__DEV__) {
      const e2eMode = await AsyncStorage.getItem("e2eTestMode");
      if (e2eMode === "true") {
        setImage(E2E_TEST_IMAGE_URI);
        return;
      }
    }

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

  /** Update the assistant bubble currently being streamed. */
  const patchStreamingAssistant = (
    updater: (message: ApiChatMessage) => ApiChatMessage
  ) => {
    setMessages(prev => {
      const index = prev.map(m => m.role).lastIndexOf("assistant");
      if (index === -1) return prev;
      return [...prev.slice(0, index), updater(prev[index]), ...prev.slice(index + 1)];
    });
  };

  const handleStreamEvent = (event: ChatStreamEvent) => {
    switch (event.type) {
      case "meta":
        if (event.chatId) setChatId(event.chatId);
        break;
      case "token":
        setPhase("streaming");
        patchStreamingAssistant(message => ({
          ...message,
          isLoading: false,
          text: message.text + (event.text ?? ""),
        }));
        break;
      case "tool_start":
        patchStreamingAssistant(message => ({
          ...message,
          isLoading: true,
          agentEvents: [
            ...(message.agentEvents ?? []),
            { kind: "tool_start", label: event.tool === "web_search" ? "🔍 Searching…" : `🛠 ${event.tool}…` },
          ],
        }));
        break;
      case "tool_end":
        if (event.tool === "create_flashcard_deck" && event.deckId) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
          patchStreamingAssistant(message => ({
            ...message,
            agentEvents: [
              ...(message.agentEvents ?? []),
              {
                kind: "deck",
                deckId: event.deckId!,
                name: event.name ?? "deck",
                cardCount: event.cardCount ?? 0,
              },
            ],
          }));
          // Chat → deck toast hook (roadmap README #5 / doc 06 §2).
          setDeckToast({
            deckId: event.deckId,
            name: event.name ?? "deck",
            cardCount: event.cardCount ?? 0,
          });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setDeckToast(null), 8000);
        } else if (event.tool === "web_search") {
          patchStreamingAssistant(message => ({
            ...message,
            agentEvents: [
              ...(message.agentEvents ?? []),
              { kind: "sources", label: event.resultPreview ? `🌐 ${event.resultPreview}` : "🌐 Sources used" },
            ],
          }));
        } else if (event.tool === "create_flashcard") {
          patchStreamingAssistant(message => ({
            ...message,
            agentEvents: [
              ...(message.agentEvents ?? []),
              { kind: "sources", label: "📇 Card added" },
            ],
          }));
        }
        break;
      case "done":
        patchStreamingAssistant(message => ({ ...message, isLoading: false }));
        break;
      case "error":
        patchStreamingAssistant(message => ({
          ...message,
          isLoading: false,
          text: message.text || event.message || "Something went wrong.",
          failed: true,
        }));
        setPhase("error");
        break;
    }
  };

  const runStream = async ({ text, image: pendingImage }: PendingPayload) => {
    const controller = new AbortController();
    abortRef.current = controller;
    lastPayloadRef.current = { text, image: pendingImage };
    setPhase("sending");
    AccessibilityInfo.announceForAccessibility("Bot is typing");

    try {
      await streamChatMessage({
        chatId: chatId || "new",
        message: text,
        image: pendingImage,
        profileId: await getSelectedProfileId(),
        botId: await getSelectedBotId(),
        signal: controller.signal,
        onEvent: handleStreamEvent,
      });
      setPhase("idle");
      setImage(null);
    } catch {
      if (controller.signal.aborted) {
        // Stop pressed: keep whatever partial text already streamed in.
        patchStreamingAssistant(message => ({
          ...message,
          isLoading: false,
          text: message.text || "_Cancelled._",
          failed: !message.text,
        }));
        setPhase("idle");
        setImage(null);
      } else {
        patchStreamingAssistant(message => ({
          ...message,
          isLoading: false,
          text: message.text || "Could not reach the tutor. Please try again.",
          failed: true,
        }));
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const sendChatToServer = async () => {
    if (busy) return;
    const inputText = input.trim();
    if (!inputText && !image) {
      return;
    }
    setInput("");
    Keyboard.dismiss();
    let profileId = await getSelectedProfileId();
    const botId = await getSelectedBotId();
    if (!profileId) {
      // Empty state: auto-select the first profile instead of a dead end;
      // with no profiles at all, point the user at onboarding.
      const data = await fetchProfiles();
      const first = data?.results?.[0];
      if (first) {
        await setSelectedProfile(first);
        profileId = first.profile_id;
      } else {
        setMessages([
          {
            role: "assistant",
            image_url: null,
            text: "Let's set up a profile first — one moment!",
          },
        ]);
        router.replace("/onboarding/profile");
        return;
      }
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
    await runStream({ text: inputText, image });
  };

  const retryLastSend = async () => {
    if (busy || !lastPayloadRef.current) return;
    const payload = lastPayloadRef.current;
    const loadingMessage: ApiChatMessage = {
      role: "assistant",
      image_url: null,
      isLoading: true,
      text: "",
    };
    setMessages([...messages, loadingMessage]);
    await runStream(payload);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const openDeckFromToast = (toast: DeckToast) => {
    setDeckToast(null);
    router.push({ pathname: "/flashcards/deck", params: { deckId: toast.deckId, title: toast.name } });
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
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={useMemo(() => {
          if (Platform.OS === 'android') return 80;
          
          const { height } = Dimensions.get('window');
          // iPhone SE 3: 667px height
          // iPhone 16: 874px height
          if (height >= 800) return 90;    // Taller phones like iPhone 16
          if (height >= 600) return 60;    // Medium height phones like iPhone SE 3
          return 50;                       // Smaller devices
        }, [])}
      >
        <ThemedView style={[styles.container, { paddingBottom: 0 }]}>
          <FlatList
            inverted
            style={styles.list}
            data={[...messages].reverse()}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item, index }) => (
              <ChatMessage
                message={item}
                onRetry={item.failed ? retryLastSend : undefined}
                isStreaming={phase === "streaming" && index === 0 && item.role === "assistant"}
              />
            )}
                onStartReached={handleLoadMore}
                onStartReachedThreshold={0.5}
                ListHeaderComponent={loadingMore ? <ActivityIndicator /> : null}
              />
              {deckToast && (
                <ThemedView testID="deck-toast" style={styles.deckToast}>
                  <ThemedText style={styles.deckToastText}>
                    📇 {deckToast.cardCount} cards in “{deckToast.name}”
                  </ThemedText>
                  <ThemedButton
                    testID="deck-toast-study"
                    darkColor="#0a7ea4"
                    style={styles.deckToastButton}
                    onPress={() => openDeckFromToast(deckToast)}
                  >
                    <ThemedText style={styles.deckToastButtonText}>Study now</ThemedText>
                  </ThemedButton>
                </ThemedView>
              )}
              <ThemedView style={styles.inputContainer}>
                <ThemedTextInput
                  testID="chat-input"
                  autoFocus={!local.chatId}
                  multiline={true}
                  placeholder="Message…"
                  placeholderTextColor={placeholderColor}
                  onChangeText={setInput}
                  value={input}
                  style={[styles.input, { borderColor: inputBorderColor }]}
                ></ThemedTextInput>
                <ThemedButton
                  testID="camera-button"
                  darkColor="#0a7ea4"
                  style={styles.sendButton}
                  onPress={handleImagePicker}
                >
                  <IconSymbol
                    name="camera.fill"
                    color="#fff"
                    size={22}
                  ></IconSymbol>
                </ThemedButton>
                {busy ? (
                  <ThemedButton
                    testID="stop-button"
                    darkColor="#d9534f"
                    style={styles.sendButton}
                    onPress={handleStop}
                  >
                    <IconSymbol
                      name="stop.fill"
                      color="#fff"
                      size={20}
                    ></IconSymbol>
                  </ThemedButton>
                ) : (
                  <ThemedButton
                    testID="send-button"
                    darkColor="#0a7ea4"
                    style={styles.sendButton}
                    onPress={sendChatToServer}
                  >
                    <IconSymbol
                      name="arrow.up"
                      color="#fff"
                      size={22}
                    ></IconSymbol>
                  </ThemedButton>
                )}
              </ThemedView>
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
    alignItems: "center" as FlexAlignType,
    paddingHorizontal: 12,
  },
  input: {
    flex: 4,
    minHeight: 44,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sendButton: {
    height: 44,
    width: 44,
    marginLeft: 8,
    borderRadius: 22,
    justifyContent: "center" as FlexAlignType,
    alignItems: "center" as FlexAlignType,
  },
  deckToast: {
    position: "absolute" as const,
    bottom: 80,
    left: 20,
    right: 20,
    flexDirection: "row" as "row",
    alignItems: "center" as FlexAlignType,
    justifyContent: "space-between" as const,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  deckToastText: {
    flexShrink: 1,
    marginRight: 8,
  },
  deckToastButton: {
    paddingHorizontal: 12,
    height: 36,
    justifyContent: "center" as FlexAlignType,
  },
  deckToastButtonText: {
    color: "#fff",
    fontSize: 14,
  },
};
