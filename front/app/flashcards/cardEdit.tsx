import { Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { FormModal } from "@/components/FormModal";
import { useState } from "react";
import * as Sentry from "@sentry/react-native";

import { updateFlashcard, deleteFlashcard } from "@/api/flashcards";

export default function CardEdit() {
  const router = useRouter();
  const { deckId, flashcardId, front, back } = useLocalSearchParams<{
    deckId: string;
    flashcardId: string;
    front: string;
    back: string;
  }>();
  const [cardFront, setCardFront] = useState(() => front || "");
  const [cardBack, setCardBack] = useState(() => back || "");

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
    <FormModal
      style={{ justifyContent: "flex-start" }}
      fields={[
        {
          label: "Front (question)",
          placeholder: "Enter the question or term",
          value: cardFront,
          onChangeText: setCardFront,
          multiline: true,
          height: 120,
        },
        {
          label: "Back (answer)",
          placeholder: "Enter the answer or definition",
          value: cardBack,
          onChangeText: setCardBack,
          multiline: true,
          height: 120,
        },
      ]}
      submitLabel="Save"
      onSubmit={handleSave}
      cancelLabel="Delete"
      onCancel={handleDelete}
      cancelDestructive
    />
  );
}