import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
  Alert,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";

import { fetchFlashcards, Flashcard } from "@/api/flashcards";
import { useThemeColor } from "@/hooks/useThemeColor";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;

export default function Study() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cardBackground = useThemeColor({}, "cardBackground");
  const studyCardBack = useThemeColor({}, "studyCardBack");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const disabledColor = useThemeColor({}, "disabled");
  const navButtonBg = useThemeColor({}, "navButton");
  const navButtonIcon = useThemeColor({}, "navButtonIcon");

  useEffect(() => {
    const loadCards = async () => {
      if (!deckId) {
        Alert.alert("Error", "Invalid deck");
        router.back();
        return;
      }
      const flashcards = await fetchFlashcards(deckId);
      setCards(flashcards.results || []);
    };
    loadCards();
  }, [deckId]);

  const flipCard = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsFlipped(!isFlipped);
  };

  const goToNext = () => {
    if (currentIndex < cards.length - 1) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setIsFlipped(false);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setIsFlipped(false);
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (cards.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.emptyText}>No cards to study</ThemedText>
      </ThemedView>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.progress}>
          {currentIndex + 1} / {cards.length}
        </ThemedText>
      </View>

      <TouchableOpacity
        style={styles.cardContainer}
        onPress={flipCard}
        activeOpacity={0.9}
      >
        {!isFlipped ? (
          <View
            style={[
              styles.card,
              { backgroundColor: cardBackground },
            ]}
          >
            <ThemedText style={[styles.cardText, { color: textColor }]}>
              {currentCard?.front}
            </ThemedText>
            <ThemedText style={[styles.tapHint, { color: iconColor }]}>
              Tap to reveal
            </ThemedText>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: studyCardBack },
            ]}
          >
            <ThemedText style={[styles.cardText, { color: textColor }]}>
              {currentCard?.back}
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.navigation}>
        <Pressable
          style={[
            styles.navButton,
            { backgroundColor: navButtonBg },
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
          onPress={goToPrev}
          disabled={currentIndex === 0}
        >
          <IconSymbol
            name="chevron.left"
            size={30}
            color={currentIndex === 0 ? disabledColor : navButtonIcon}
          />
        </Pressable>
        <Pressable
          style={[
            styles.navButton,
            { backgroundColor: navButtonBg },
            currentIndex === cards.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={goToNext}
          disabled={currentIndex === cards.length - 1}
        >
          <IconSymbol
            name="chevron.right"
            size={30}
            color={currentIndex === cards.length - 1 ? disabledColor : navButtonIcon}
          />
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  progress: {
    fontSize: 18,
    fontWeight: "600",
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: 300,
    alignSelf: "center",
  },
  card: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 16,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cardText: {
    fontSize: 20,
    textAlign: "center",
  },
  tapHint: {
    position: "absolute",
    bottom: 20,
    fontSize: 14,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
    paddingHorizontal: 20,
  },
  navButton: {
    padding: 20,
    borderRadius: 30,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 100,
  },
});
