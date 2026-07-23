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
import * as Progress from "react-native-progress";

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
  const [completed, setCompleted] = useState(false);

  const cardBackground = useThemeColor({}, "cardBackground");
  const studyCardBack = useThemeColor({}, "studyCardBack");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
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
  }, [deckId, router]);

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

  const finish = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setCompleted(true);
  };

  const restart = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsFlipped(false);
    setCurrentIndex(0);
    setCompleted(false);
  };

  if (cards.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.emptyText}>No cards to study</ThemedText>
      </ThemedView>
    );
  }

  if (completed) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.completion}>
          <ThemedText style={styles.completionTitle}>Done! 🎉</ThemedText>
          <ThemedText style={styles.completionSubtitle}>
            You studied all {cards.length} cards.
          </ThemedText>
          <Pressable
            testID="study-restart"
            style={[styles.restartButton, { backgroundColor: tintColor }]}
            onPress={restart}
          >
            <ThemedText style={styles.restartButtonText}>Restart</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const currentCard = cards[currentIndex];
  const isLastCard = currentIndex === cards.length - 1;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.progress}>
          {currentIndex + 1} / {cards.length}
        </ThemedText>
        <Progress.Bar
          progress={(currentIndex + 1) / cards.length}
          width={null}
          height={6}
          color={tintColor}
          unfilledColor={borderColor}
          borderWidth={0}
          borderRadius={3}
          style={styles.progressBar}
        />
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
              { backgroundColor: cardBackground, borderColor: borderColor },
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
              { backgroundColor: studyCardBack, borderColor: tintColor },
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
          testID="study-prev"
          style={[
            styles.navButton,
            { backgroundColor: navButtonBg },
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
          onPress={goToPrev}
          disabled={currentIndex === 0}
        >
          <IconSymbol name="chevron.left" size={30} color={navButtonIcon} />
        </Pressable>
        <Pressable
          testID="study-next"
          style={[styles.navButton, { backgroundColor: navButtonBg }]}
          onPress={isLastCard ? finish : goToNext}
        >
          <IconSymbol
            name={isLastCard ? "checkmark" : "chevron.right"}
            size={30}
            color={navButtonIcon}
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
  progressBar: {
    alignSelf: "stretch",
    marginTop: 8,
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
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
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
    justifyContent: "center",
    gap: 32,
    marginTop: 32,
  },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  completion: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  completionTitle: {
    fontSize: 28,
    fontWeight: "600",
  },
  completionSubtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  restartButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  restartButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 100,
  },
});
