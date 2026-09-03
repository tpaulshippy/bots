import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useLayoutEffect, useCallback, useState } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { FAB } from "@/components/FAB";
import { FormModal } from "@/components/FormModal";
import { IconSymbol } from "@/components/ui/IconSymbol";
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
  const iconColor = useThemeColor({}, "icon");
  const tintColor = useThemeColor({}, "tint");

  const navigation = useNavigation();

  const refresh = useCallback(async (isPullToRefresh = false) => {
    if (!deckId) {
      Sentry.captureException(new Error("refresh called with missing deckId"));
      setRefreshing(false);
      setLoading(false);
      return;
    }
    if (isPullToRefresh) {
      setRefreshing(true);
    }
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
      // Default study queue is due-only (see study.tsx).
      params: { deckId, title: deck?.name, mode: "due" },
    });
  };

  if (loading && !deck) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.activityIndicator} />
      </ThemedView>
    );
  }

  if (showAddCard) {
    return (
      <FormModal
        fields={[
          {
            placeholder: "Front (question)",
            value: newCardFront,
            onChangeText: setNewCardFront,
            multiline: true,
            height: 100,
          },
          {
            placeholder: "Back (answer)",
            value: newCardBack,
            onChangeText: setNewCardBack,
            multiline: true,
            height: 100,
          },
        ]}
        submitLabel="Add"
        onSubmit={handleAddCard}
        onCancel={() => {
          setShowAddCard(false);
          setNewCardFront("");
          setNewCardBack("");
        }}
      />
    );
  }

  if (isEditing) {
    return (
      <FormModal
        fields={[
          {
            placeholder: "Deck name",
            value: editName,
            onChangeText: setEditName,
          },
          {
            placeholder: "Description",
            value: editDescription,
            onChangeText: setEditDescription,
            multiline: true,
            height: 80,
          },
        ]}
        submitLabel="Save"
        onSubmit={handleSaveDeck}
        onCancel={() => {
          setIsEditing(false);
          setEditName(deck?.name || "");
          setEditDescription(deck?.description || "");
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable style={styles.headerButton} onPress={() => setIsEditing(true)}>
          <IconSymbol name="pencil" size={20} color={iconColor} />
        </Pressable>
        <Pressable style={styles.headerButton} onPress={handleDeleteDeck}>
          <IconSymbol name="trash" size={20} color="#d33" />
        </Pressable>
      </View>

      {deck?.description ? (
        <ThemedText style={[styles.description, { color: iconColor }]}>{deck.description}</ThemedText>
      ) : null}

      <Pressable
        testID="study-button"
        style={[styles.studyButton, { backgroundColor: tintColor }]}
        onPress={handleStudyPress}
      >
        <ThemedText style={styles.studyButtonText}>
          {(deck?.due_count ?? 0) > 0 ? `Study (${deck?.due_count})` : "Study"}
        </ThemedText>
      </Pressable>

      <FAB icon="plus" onPress={() => setShowAddCard(true)} />

      <FlatList
        style={styles.list}
        data={flashcards}
        keyExtractor={(item) => item.flashcard_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} />
        }
        renderItem={({ item, index }) => (
          <Pressable
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
            <View style={styles.cardTextContainer}>
              <ThemedText style={styles.cardFront} numberOfLines={1}>
                {item.front}
              </ThemedText>
              <ThemedText
                style={[styles.cardBack, { color: iconColor }]}
                numberOfLines={1}
              >
                {item.back}
              </ThemedText>
            </View>
            <IconSymbol name="pencil" size={18} color={iconColor} />
          </Pressable>
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
    marginHorizontal: 12,
    marginVertical: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  studyButtonText: {
    color: "white",
    fontSize: 16,
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
  cardTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  cardFront: {
    fontSize: 16,
  },
  cardBack: {
    fontSize: 14,
    marginTop: 2,
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
});