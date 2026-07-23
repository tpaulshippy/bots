import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Pressable,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useState } from "react";
import * as Sentry from "@sentry/react-native";

import { fetchDecks, createDeck, DeckListItem } from "@/api/flashcards";

export default function Flashcards() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const iconColor = useThemeColor({}, "icon");
  const accentColor = useThemeColor({ dark: "#00a4c9" }, "tint");

  const getProfileId = useCallback(async () => {
    const profileData = await AsyncStorage.getItem("selectedProfile");
    if (profileData) {
      const profile = JSON.parse(profileData);
      return profile.profile_id;
    }
    return null;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const profileId = await getProfileId();
      if (!profileId) {
        setRefreshing(false);
        return;
      }
      const data = await fetchDecks(profileId);
      setDecks(data.results || []);
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [getProfileId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      Alert.alert("Error", "Please enter a deck name");
      return;
    }
    try {
      const profileId = await getProfileId();
      if (!profileId) {
        Alert.alert("Error", "No profile found");
        return;
      }
      const result = await createDeck(newDeckName.trim(), newDeckDescription.trim(), profileId);
      if (result) {
        setShowCreateModal(false);
        setNewDeckName("");
        setNewDeckDescription("");
        refresh();
      } else {
        Sentry.captureException(new Error("Failed to create deck: null response"));
        Alert.alert("Error", "Failed to create deck");
      }
    } catch (error) {
      Sentry.captureException(error);
      Alert.alert("Error", "Failed to create deck");
    }
  };

  const handleDeckPress = (deck: DeckListItem) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/flashcards/deck",
      params: { deckId: deck.deck_id, title: deck.name },
    });
  };

  if (showCreateModal) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.modalContainer}>
          <ThemedText style={styles.modalTitle}>Create New Deck</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Deck name"
            placeholderTextColor="#888"
            value={newDeckName}
            onChangeText={setNewDeckName}
          />
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Description (optional)"
            placeholderTextColor="#888"
            value={newDeckDescription}
            onChangeText={setNewDeckDescription}
            multiline
          />
          <View style={styles.modalButtons}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setShowCreateModal(false);
                setNewDeckName("");
                setNewDeckDescription("");
              }}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.saveButton}
              onPress={handleCreateDeck}
            >
              <ThemedText style={styles.saveButtonText}>Create</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Pressable style={styles.fab} onPress={() => setShowCreateModal(true)}>
        <IconSymbol name="plus" color="white"></IconSymbol>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={styles.activityIndicator} />
      ) : (
        <FlatList
          style={styles.list}
          data={decks}
          keyExtractor={(item) => item.deck_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.itemContainer,
                { backgroundColor: cardBackground, borderColor },
              ]}
              onPress={() => handleDeckPress(item)}
            >
              <IconSymbol
                name="square.grid.2x2.fill"
                size={28}
                color={accentColor}
                style={styles.deckIcon}
              />
              <View style={styles.itemContent}>
                <ThemedText style={styles.deckName} numberOfLines={1}>
                  {item.name}
                </ThemedText>
                {item.description ? (
                  <ThemedText
                    style={[styles.description, { color: iconColor }]}
                    numberOfLines={1}
                  >
                    {item.description}
                  </ThemedText>
                ) : null}
              </View>
              <View
                style={[styles.countBadge, { backgroundColor: accentColor + "26" }]}
              >
                <ThemedText style={[styles.countBadgeText, { color: accentColor }]}>
                  {item.card_count} cards
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={iconColor} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol
                name="square.grid.2x2.fill"
                size={48}
                color={iconColor}
              />
              <ThemedText style={styles.emptyText}>
                No decks yet
              </ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Decks can be created from chats, or tap + to create one
              </ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
    marginHorizontal: 10,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  deckIcon: {
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  deckName: {
    fontSize: 16,
    fontWeight: "600",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
    marginTop: 4,
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
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#888",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    textAlign: "center",
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