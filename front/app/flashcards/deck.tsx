import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useLayoutEffect } from "react";
import type { StackNavigationProp } from "@react-navigation/stack";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useCallback, useState } from "react";
import * as Sentry from "@sentry/react-native";

import {
  fetchDeck,
  updateDeck,
  deleteDeck,
  createFlashcard,
  deleteFlashcard,
  Deck,
  Flashcard,
} from "@/api/flashcards";
import { PlatformPressable } from "@react-navigation/elements";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function DeckDetail() {
  const router = useRouter();
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const tintColor = useThemeColor({}, "tint");
  const cardBackground = useThemeColor({}, "cardBackground");

  type FlashcardsParamList = {
    "flashcards/deck": { deckId: string };
    "flashcards/study": { deckId: string; title?: string };
    "flashcards/cardEdit": { deckId: string; flashcardId: string; front: string; back: string };
  };
  const navigation = useNavigation<StackNavigationProp<FlashcardsParamList, "flashcards/deck">>();

  const refresh = useCallback(async () => {
    if (!deckId) {
      Sentry.captureException(new Error("refresh called with missing deckId"));
      setRefreshing(false);
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const deckData = await fetchDeck(deckId);
      if (deckData) {
        setDeck(deckData);
        setFlashcards(deckData.flashcards || []);
        setEditName(deckData.name);
        setEditDescription(deckData.description);
      } else {
        Sentry.captureException(new Error("fetchDeck returned null for valid deckId"));
      }
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [deckId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useLayoutEffect(() => {
    if (!navigation.isFocused()) return;
    if (showAddCard) {
      navigation.setOptions({ title: "Add New Card" });
    } else if (isEditing) {
      navigation.setOptions({ title: "Edit Deck" });
    } else {
      navigation.setOptions({ title: deck?.name || "" });
    }
  }, [showAddCard, isEditing, deck?.name, navigation]);

  const handleSaveDeck = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Deck name cannot be empty");
      return;
    }
    try {
      const result = await updateDeck(deckId, editName.trim(), editDescription.trim());
      if (result) {
        setIsEditing(false);
        refresh();
      } else {
        Sentry.captureException(new Error("Failed to update deck: null response"));
        Alert.alert("Error", "Failed to update deck");
      }
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to update deck");
    }
  };

  const handleDeleteDeck = () => {
    Alert.alert(
      "Delete Deck",
      "Are you sure you want to delete this deck? All cards will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await deleteDeck(deckId);
              if (result) {
                router.back();
              } else {
                Sentry.captureException(new Error("Failed to delete deck: false response"));
                Alert.alert("Error", "Failed to delete deck");
              }
            } catch (error) {
              Sentry.captureException(error);
              Alert.alert("Error", "Failed to delete deck");
            }
          },
        },
      ]
    );
  };

  const handleAddCard = async () => {
    if (!newCardFront.trim() || !newCardBack.trim()) {
      Alert.alert("Error", "Please fill in both front and back of the card");
      return;
    }
    try {
      const result = await createFlashcard(deckId, newCardFront.trim(), newCardBack.trim());
      if (result) {
        setShowAddCard(false);
        setNewCardFront("");
        setNewCardBack("");
        refresh();
      } else {
        Sentry.captureException(new Error("Failed to add card: null response"));
        Alert.alert("Error", "Failed to add card");
      }
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to add card");
    }
  };

  const handleDeleteCard = (flashcard: Flashcard) => {
    Alert.alert(
      "Delete Card",
      "Are you sure you want to delete this card?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await deleteFlashcard(deckId, flashcard.flashcard_id);
              if (result) {
                refresh();
              } else {
                Sentry.captureException(new Error("Failed to delete card: false response"));
                Alert.alert("Error", "Failed to delete card");
              }
            } catch (error) {
              Sentry.captureException(error);
              Alert.alert("Error", "Failed to delete card");
            }
          },
        },
      ]
    );
  };

  const handleStudyPress = () => {
    router.push({
      pathname: "/flashcards/study",
      params: { deckId, title: deck?.name },
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.activityIndicator} />
      </ThemedView>
    );
  }

  if (showAddCard) {
    return (
      <ThemedView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <TextInput
                style={[styles.input, styles.cardInput, { borderColor, color: textColor }]}
                placeholder="Front (question)"
                placeholderTextColor={iconColor}
                value={newCardFront}
                onChangeText={setNewCardFront}
                multiline
              />
              <TextInput
                style={[styles.input, styles.cardInput, { borderColor, color: textColor }]}
                placeholder="Back (answer)"
                placeholderTextColor={iconColor}
                value={newCardBack}
                onChangeText={setNewCardBack}
                multiline
              />
              <View style={styles.modalButtons}>
                <PlatformPressable
                  style={[styles.cancelButton, { backgroundColor: cardBackground }]}
                  onPress={() => {
                    setShowAddCard(false);
                    setNewCardFront("");
                    setNewCardBack("");
                  }}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </PlatformPressable>
                <PlatformPressable style={[styles.saveButton, { backgroundColor: tintColor }]} onPress={handleAddCard}>
                  <ThemedText style={styles.saveButtonText}>Add</ThemedText>
                </PlatformPressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

  if (isEditing) {
    return (
      <ThemedView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <TextInput
                style={[styles.input, { borderColor, color: textColor }]}
                placeholder="Deck name"
                placeholderTextColor={iconColor}
                value={editName}
                onChangeText={setEditName}
              />
              <TextInput
                style={[styles.input, styles.descriptionInput, { borderColor, color: textColor }]}
                placeholder="Description"
                placeholderTextColor={iconColor}
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
              />
              <View style={styles.modalButtons}>
                <PlatformPressable
                  style={[styles.cancelButton, { backgroundColor: cardBackground }]}
                  onPress={() => {
                    setIsEditing(false);
                    setEditName(deck?.name || "");
                    setEditDescription(deck?.description || "");
                  }}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </PlatformPressable>
                <PlatformPressable style={[styles.saveButton, { backgroundColor: tintColor }]} onPress={handleSaveDeck}>
                  <ThemedText style={styles.saveButtonText}>Save</ThemedText>
                </PlatformPressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <PlatformPressable style={styles.headerButton} onPress={() => setIsEditing(true)}>
          <IconSymbol name="pencil" size={20} color={iconColor} />
        </PlatformPressable>
        <PlatformPressable style={styles.headerButton} onPress={handleDeleteDeck}>
          <IconSymbol name="trash" size={20} color="#d33" />
        </PlatformPressable>
        <PlatformPressable
          style={[styles.studyButton, { backgroundColor: tintColor }]}
          onPress={handleStudyPress}
        >
          <ThemedText style={styles.studyButtonText}>Study</ThemedText>
        </PlatformPressable>
      </View>

      {deck?.description ? (
        <ThemedText style={[styles.description, { color: iconColor }]}>{deck.description}</ThemedText>
      ) : null}

      <PlatformPressable style={[styles.fab, { backgroundColor: tintColor }]} onPress={() => setShowAddCard(true)}>
        <IconSymbol name="plus" color="white"></IconSymbol>
      </PlatformPressable>

      <FlatList
        style={styles.list}
        data={flashcards}
        keyExtractor={(item) => item.flashcard_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        renderItem={({ item, index }) => (
          <PlatformPressable
            style={[styles.cardItem, { borderBottomColor: borderColor }]}
            onPress={() =>
              router.push({
                pathname: "/flashcards/cardEdit",
                params: {
                  deckId,
                  flashcardId: item.flashcard_id,
                  front: item.front,
                  back: item.back,
                },
              })
            }
            onLongPress={() => handleDeleteCard(item)}
          >
            <ThemedText style={[styles.cardNumber, { color: iconColor }]}>#{index + 1}</ThemedText>
            <ThemedText style={styles.cardFront} numberOfLines={2}>
              {item.front}
            </ThemedText>
          </PlatformPressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={[styles.emptyText, { color: iconColor }]}>No cards yet</ThemedText>
            <ThemedText style={[styles.emptySubtext, { color: iconColor }]}>
              Tap + to add your first card
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
  },
  studyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  studyButtonText: {
    color: "white",
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
    padding: 12,
    paddingTop: 0,
  },
  list: {
    flex: 1,
    marginHorizontal: 10,
  },
  cardItem: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  cardNumber: {
    fontSize: 14,
    marginRight: 12,
    width: 30,
  },
  cardFront: {
    flex: 1,
    fontSize: 16,
  },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 15,
  },
  activityIndicator: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  cardInput: {
    height: 100,
    textAlignVertical: "top",
  },
  descriptionInput: {
    height: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    marginRight: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    padding: 12,
    marginLeft: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});