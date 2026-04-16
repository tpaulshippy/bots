import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import * as Sentry from "@sentry/react-native";

import {
  fetchDeck,
  updateDeck,
  deleteDeck,
  fetchFlashcards,
  createFlashcard,
  deleteFlashcard,
  Deck,
  Flashcard,
} from "@/api/flashcards";
import { PlatformPressable } from "@react-navigation/elements";

export default function DeckDetail() {
  const router = useRouter();
  const { deckId, title } = useLocalSearchParams<{ deckId: string; title: string }>();
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const deckData = await fetchDeck(deckId);
      if (deckData) {
        setDeck(deckData);
        setFlashcards(deckData.flashcards || []);
        setEditName(deckData.name);
        setEditDescription(deckData.description);
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

  const handleSaveDeck = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Deck name cannot be empty");
      return;
    }
    try {
      await updateDeck(deckId, editName.trim(), editDescription.trim());
      setIsEditing(false);
      refresh();
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
              await deleteDeck(deckId);
              router.back();
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
      await createFlashcard(deckId, newCardFront.trim(), newCardBack.trim());
      setShowAddCard(false);
      setNewCardFront("");
      setNewCardBack("");
      refresh();
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
              await deleteFlashcard(deckId, flashcard.flashcard_id);
              refresh();
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
        <View style={styles.modalContainer}>
          <ThemedText style={styles.modalTitle}>Add New Card</ThemedText>
          <TextInput
            style={[styles.input, styles.cardInput]}
            placeholder="Front (question)"
            placeholderTextColor="#888"
            value={newCardFront}
            onChangeText={setNewCardFront}
            multiline
          />
          <TextInput
            style={[styles.input, styles.cardInput]}
            placeholder="Back (answer)"
            placeholderTextColor="#888"
            value={newCardBack}
            onChangeText={setNewCardBack}
            multiline
          />
          <View style={styles.modalButtons}>
            <PlatformPressable
              style={styles.cancelButton}
              onPress={() => {
                setShowAddCard(false);
                setNewCardFront("");
                setNewCardBack("");
              }}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </PlatformPressable>
            <PlatformPressable style={styles.saveButton} onPress={handleAddCard}>
              <ThemedText style={styles.saveButtonText}>Add</ThemedText>
            </PlatformPressable>
          </View>
        </View>
      </ThemedView>
    );
  }

  if (isEditing) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.modalContainer}>
          <ThemedText style={styles.modalTitle}>Edit Deck</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Deck name"
            placeholderTextColor="#888"
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Description"
            placeholderTextColor="#888"
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
          />
          <View style={styles.modalButtons}>
            <PlatformPressable
              style={styles.cancelButton}
              onPress={() => {
                setIsEditing(false);
                setEditName(deck?.name || "");
                setEditDescription(deck?.description || "");
              }}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </PlatformPressable>
            <PlatformPressable style={styles.saveButton} onPress={handleSaveDeck}>
              <ThemedText style={styles.saveButtonText}>Save</ThemedText>
            </PlatformPressable>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <PlatformPressable style={styles.headerButton} onPress={() => setIsEditing(true)}>
          <IconSymbol name="pencil" size={20} color="#666" />
        </PlatformPressable>
        <PlatformPressable style={styles.headerButton} onPress={handleDeleteDeck}>
          <IconSymbol name="trash" size={20} color="#d33" />
        </PlatformPressable>
        <PlatformPressable
          style={[styles.studyButton]}
          onPress={handleStudyPress}
        >
          <ThemedText style={styles.studyButtonText}>Study</ThemedText>
        </PlatformPressable>
      </View>

      {deck?.description ? (
        <ThemedText style={styles.description}>{deck.description}</ThemedText>
      ) : null}

      <PlatformPressable style={styles.fab} onPress={() => setShowAddCard(true)}>
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
            style={styles.cardItem}
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
            <ThemedText style={styles.cardNumber}>#{index + 1}</ThemedText>
            <ThemedText style={styles.cardFront} numberOfLines={2}>
              {item.front}
            </ThemedText>
          </PlatformPressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>No cards yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  headerButton: {
    padding: 8,
  },
  studyButton: {
    backgroundColor: "#03465b",
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
    color: "#666",
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
    borderBottomColor: "#ccc",
    alignItems: "center",
  },
  cardNumber: {
    fontSize: 14,
    color: "#888",
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
    backgroundColor: "#03465b",
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
    color: "#888",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
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
    backgroundColor: "#ccc",
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
    backgroundColor: "#03465b",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});