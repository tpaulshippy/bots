import {
  StyleSheet,
  View,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useState, useEffect } from "react";
import * as Sentry from "@sentry/react-native";

import { updateFlashcard, deleteFlashcard } from "@/api/flashcards";
import { PlatformPressable } from "@react-navigation/elements";

export default function CardEdit() {
  const router = useRouter();
  const { deckId, flashcardId, front, back } = useLocalSearchParams<{
    deckId: string;
    flashcardId: string;
    front: string;
    back: string;
  }>();
  const [cardFront, setCardFront] = useState(front || "");
  const [cardBack, setCardBack] = useState(back || "");

  useEffect(() => {
    setCardFront(front || "");
    setCardBack(back || "");
  }, [front, back]);

  const handleSave = async () => {
    if (!deckId || !flashcardId) {
      Sentry.captureException(new Error("Missing deckId or flashcardId in cardEdit"));
      Alert.alert("Error", "Invalid card parameters");
      return;
    }
    if (!cardFront.trim() || !cardBack.trim()) {
      Alert.alert("Error", "Please fill in both front and back of the card");
      return;
    }
    try {
      const result = await updateFlashcard(deckId, flashcardId, cardFront.trim(), cardBack.trim());
      if (result) {
        router.back();
      } else {
        Sentry.captureException(new Error("Failed to update card: null response"));
        Alert.alert("Error", "Failed to update card");
      }
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to update card");
    }
  };

  const handleDelete = () => {
    if (!deckId || !flashcardId) {
      Sentry.captureException(new Error("Missing deckId or flashcardId in cardEdit"));
      Alert.alert("Error", "Invalid card parameters");
      return;
    }
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
              const result = await deleteFlashcard(deckId, flashcardId);
              if (result) {
                router.back();
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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText style={styles.label}>Front (question)</ThemedText>
        <TextInput
          style={[styles.input, styles.cardInput]}
          placeholder="Enter the question or term"
          placeholderTextColor="#888"
          value={cardFront}
          onChangeText={setCardFront}
          multiline
        />

        <ThemedText style={styles.label}>Back (answer)</ThemedText>
        <TextInput
          style={[styles.input, styles.cardInput]}
          placeholder="Enter the answer or definition"
          placeholderTextColor="#888"
          value={cardBack}
          onChangeText={setCardBack}
          multiline
        />

        <View style={styles.buttons}>
          <PlatformPressable style={styles.deleteButton} onPress={handleDelete}>
            <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
          </PlatformPressable>
          <PlatformPressable style={styles.saveButton} onPress={handleSave}>
            <ThemedText style={styles.saveButtonText}>Save</ThemedText>
          </PlatformPressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  cardInput: {
    height: 120,
    textAlignVertical: "top",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  deleteButton: {
    flex: 1,
    padding: 14,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: "#d33",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  saveButton: {
    flex: 1,
    padding: 14,
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