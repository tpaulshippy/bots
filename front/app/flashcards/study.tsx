import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
  Alert,
  Pressable,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import * as Progress from "react-native-progress";
import * as Sentry from "@sentry/react-native";
import { formatDistanceToNowStrict } from "date-fns";

import {
  fetchStudyQueue,
  reviewFlashcard,
  Flashcard,
  FlashcardRating,
} from "@/api/flashcards";
import { useThemeColor } from "@/hooks/useThemeColor";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;

// Rating buttons shown after the flip. Interval hints mirror the SM-2
// defaults for an early card (<1d for Again's same-day relearn step).
const RATINGS: { rating: FlashcardRating; label: string; hint: string }[] = [
  { rating: "again", label: "Again", hint: "<1d" },
  { rating: "hard", label: "Hard", hint: "1d" },
  { rating: "good", label: "Good", hint: "3d" },
  { rating: "easy", label: "Easy", hint: "7d" },
];

export default function Study() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [againCount, setAgainCount] = useState(0);
  const [reviewedDues, setReviewedDues] = useState<string[]>([]);
  const [ratingInProgress, setRatingInProgress] = useState(false);
  const [now] = useState(() => Date.now());

  const [flipAnim] = useState(() => new Animated.Value(0));

  const cardBackground = useThemeColor({}, "cardBackground");
  const studyCardBack = useThemeColor({}, "studyCardBack");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icon");
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  useEffect(() => {
    const loadQueue = async () => {
      if (!deckId) {
        Alert.alert("Error", "Invalid deck");
        router.back();
        return;
      }
      try {
        // Default study queue: only cards that are due right now.
        const dueCards = await fetchStudyQueue(deckId, "due");
        setCards(dueCards);
      } catch (error) {
        Sentry.captureException(error);
        setCards([]);
      } finally {
        setLoading(false);
      }
    };
    loadQueue();
  }, [deckId, router]);

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const flipCard = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      friction: 8,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const resetFlip = () => {
    flipAnim.setValue(0);
    setIsFlipped(false);
  };

  const handleStudyAllAnyway = async () => {
    if (!deckId) return;
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLoading(true);
    try {
      const allCards = await fetchStudyQueue(deckId, "all");
      setCards(allCards);
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRating = async (rating: FlashcardRating) => {
    if (ratingInProgress || !deckId) return;
    setRatingInProgress(true);

    if (process.env.EXPO_OS === "ios") {
      if (rating === "again") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }

    const currentCard = cards[currentIndex];
    let nextDueAt: string | null = null;
    try {
      const updated = await reviewFlashcard(
        deckId,
        currentCard.flashcard_id,
        rating
      );
      nextDueAt = updated?.due_at ?? null;
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to save your review");
    }

    if (rating === "again") {
      setAgainCount(againCount + 1);
    }
    if (nextDueAt) {
      setReviewedDues((prev) => [...prev, nextDueAt as string]);
    }

    if (currentIndex < cards.length - 1) {
      resetFlip();
      setCurrentIndex(currentIndex + 1);
    } else {
      setCompleted(true);
    }
    setRatingInProgress(false);
  };

  const earliestNextDue = (): string | null => {
    if (reviewedDues.length === 0) return null;
    const times = reviewedDues
      .map((iso) => new Date(iso).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    const earliest = new Date(Math.min(...times));
    const diffMs = earliest.getTime() - now;
    if (diffMs <= 0) return "now";
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 60) return `${minutes} min`;
    return formatDistanceToNowStrict(earliest);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.activityIndicator} />
      </ThemedView>
    );
  }

  if (cards.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>Nothing due 🎉</ThemedText>
          <ThemedText style={[styles.emptySubtext, { color: iconColor }]}>
            All caught up on this deck.
          </ThemedText>
          <Pressable
            testID="study-all-anyway"
            style={[styles.studyAllButton, { backgroundColor: tintColor }]}
            onPress={handleStudyAllAnyway}
          >
            <ThemedText style={styles.ratingButtonText}>
              Study all anyway
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  if (completed) {
    const nextDueIn = earliestNextDue();
    return (
      <ThemedView style={styles.container}>
        <View style={styles.completion}>
          <ThemedText testID="study-session-complete" style={styles.completionTitle}>
            Session complete! 🎉
          </ThemedText>
          <ThemedText style={styles.completionSubtitle}>
            You reviewed {cards.length} card{cards.length === 1 ? "" : "s"}.
          </ThemedText>
          {againCount > 0 ? (
            <ThemedText style={[styles.completionStat, { color: iconColor }]}>
              {againCount} rated “Again” — they&apos;ll be back soon.
            </ThemedText>
          ) : null}
          {nextDueIn ? (
            <ThemedText style={[styles.completionStat, { color: iconColor }]}>
              Next due in {nextDueIn}.
            </ThemedText>
          ) : null}
          <Pressable
            testID="study-complete-done"
            style={[styles.doneButton, { backgroundColor: tintColor }]}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.ratingButtonText}>Done</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const currentCard = cards[currentIndex];
  const reviewedCount = currentIndex;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText testID="study-progress" style={styles.progress}>
          {reviewedCount} / {cards.length}
        </ThemedText>
        <Progress.Bar
          progress={cards.length > 0 ? reviewedCount / cards.length : 0}
          width={null}
          height={6}
          color={tintColor}
          unfilledColor={borderColor}
          borderWidth={0}
          borderRadius={3}
          style={styles.progressBar}
        />
        <ThemedText style={[styles.remaining, { color: iconColor }]}>
          {cards.length - reviewedCount} left in session
        </ThemedText>
      </View>

      <TouchableOpacity
        testID="study-card"
        style={styles.cardContainer}
        onPress={flipCard}
        activeOpacity={0.9}
      >
        <Animated.View
          style={[
            styles.cardFace,
            { transform: [{ rotateY: frontRotate }] },
          ]}
        >
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
        </Animated.View>
        <Animated.View
          style={[
            styles.cardFace,
            { transform: [{ rotateY: backRotate }] },
          ]}
        >
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
        </Animated.View>
      </TouchableOpacity>

      <View style={styles.ratingRow}>
        {isFlipped ? (
          RATINGS.map(({ rating, label, hint }) => (
            <Pressable
              key={rating}
              testID={`study-rating-${rating}`}
              style={({ pressed }) => [
                styles.ratingButton,
                { backgroundColor: rating === "again" ? "#d9534f" : tintColor },
                pressed && styles.ratingButtonPressed,
                ratingInProgress && styles.ratingButtonDisabled,
              ]}
              onPress={() => handleRating(rating)}
              disabled={ratingInProgress}
            >
              <ThemedText style={styles.ratingButtonText}>{label}</ThemedText>
              <ThemedText style={styles.ratingHint}>{hint}</ThemedText>
            </Pressable>
          ))
        ) : (
          <ThemedText style={[styles.flipPrompt, { color: iconColor }]}>
            Think of the answer, then flip the card
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  activityIndicator: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  remaining: {
    fontSize: 13,
    marginTop: 6,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: 300,
    alignSelf: "center",
  },
  cardFace: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
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
  ratingRow: {
    minHeight: 96,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 32,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  ratingButtonPressed: {
    opacity: 0.7,
  },
  ratingButtonDisabled: {
    opacity: 0.4,
  },
  ratingButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  ratingHint: {
    color: "#fff",
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
  },
  flipPrompt: {
    fontSize: 14,
    textAlign: "center",
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
  completionStat: {
    fontSize: 14,
    marginTop: 8,
  },
  doneButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
  },
  studyAllButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
});
