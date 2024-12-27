import { FlatList, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useCallback, useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useFocusEffect, useRouter } from "expo-router";

export default function BotsScreen({}) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const router = useRouter();

  const refresh = async () => {
    fetchBots().then((data) => {
      setBots(data);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  const handleBotPress = async (bot: Bot) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
    router.push({
      pathname: `/parent/screens/bot`,
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer}>Bots</ThemedText>
      <ThemedView style={styles.botContainer}>
        <FlatList
          data={bots}
          keyExtractor={(item) => item.bot_id}
          renderItem={({ item }) => (
            <ThemedView style={styles.botItemContainer}>
              <PlatformPressable
                onPress={() => handleBotPress(item)}
                style={[styles.bot]}
              >
                <ThemedText style={styles.botText}>{item.name}</ThemedText>
              </PlatformPressable>
            </ThemedView>
          )}
        />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  botContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    width: "100%",
  },
  botItemContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
  },
  rowBack: {
    alignItems: "center",
    backgroundColor: "#555",
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  botIcon: {
    flex: 1,
  },
  selectedBot: {
    backgroundColor: "#444",
  },
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  bot: {
    padding: 5,
    margin: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
    elevation: 5,
  },
  botText: {
    fontSize: 24,
    padding: 10,
    textAlign: "center",
  },
  button: {
    color: "#fff",
  },
});
