import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useState, useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { fetchFlashcards, Flashcard } from "@/api/flashcards";
import { PlatformPressable } from "@react-navigation/elements";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;

export default function Study() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const flip = useSharedValue(0);

  useEffect(() => {
    const loadCards = async () => {
      const flashcards = await fetchFlashcards(deckId);
      setCards(flashcards);
    };
    loadCards();
  }, [deckId]);

  const flipCard = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    flip.value = withTiming(isFlipped ? 0 : 1, {
      duration: 400,
      easing: Easing.inOut(Easing.ease),
    });
    setIsFlipped(!isFlipped);
  };

  const goToNext = () => {
    if (currentIndex < cards.length - 1) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      flip.value = 0;
      setIsFlipped(false);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      flip.value = 0;
      setIsFlipped(false);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flip.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: "hidden" as const,
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flip.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: "hidden" as const,
    };
  });

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
        <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
          <ThemedText style={styles.cardText}>{currentCard?.front}</ThemedText>
          <ThemedText style={styles.tapHint}>Tap to reveal</ThemedText>
        </Animated.View>
        <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
          <ThemedText style={styles.cardText}>{currentCard?.back}</ThemedText>
        </Animated.View>
      </TouchableOpacity>

      <View style={styles.navigation}>
        <PlatformPressable
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={goToPrev}
          disabled={currentIndex === 0}
        >
          <IconSymbol
            name="chevron.left"
            size={30}
            color={currentIndex === 0 ? "#ccc" : "#03465b"}
          />
        </PlatformPressable>
        <PlatformPressable
          style={[
            styles.navButton,
            currentIndex === cards.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={goToNext}
          disabled={currentIndex === cards.length - 1}
        >
          <IconSymbol
            name="chevron.right"
            size={30}
            color={currentIndex === cards.length - 1 ? "#ccc" : "#03465b"}
          />
        </PlatformPressable>
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
    backgroundColor: "#fff",
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
  cardFront: {
    backgroundColor: "#fff",
  },
  cardBack: {
    backgroundColor: "#f0f8ff",
  },
  cardText: {
    fontSize: 20,
    textAlign: "center",
    color: "#333",
  },
  tapHint: {
    position: "absolute",
    bottom: 20,
    fontSize: 14,
    color: "#888",
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
    backgroundColor: "#f0f0f0",
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 18,
    color: "#888",
    textAlign: "center",
    marginTop: 100,
  },
});