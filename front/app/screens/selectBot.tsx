import { StyleSheet } from "react-native";
import { Link } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";

export default function SelectBot() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);

  useEffect(() => {
    fetchBots().then((data) => {
      setBots(data);
    });
    const loadSelectedBot = async () => {
      try {
        const botData = await AsyncStorage.getItem("selectedBot");
        if (botData) {
          const bot = JSON.parse(botData);
          setSelectedBot(bot);
        }
      } catch (error) {
        console.error("Failed to load the bot from local storage", error);
      }
    };

    loadSelectedBot();
  }, []);

  const handleBotPress = async (bot: Bot) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      if (
        selectedBot &&
        selectedBot.bot_id === bot.bot_id
      ) {
        setSelectedBot(null);
        await AsyncStorage.removeItem("selectedBot");
        return;
      } else {
        setSelectedBot(bot);
        await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
      }
    } catch (error) {
      console.error("Failed to save the bot to local storage", error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.botContainer}>
        {bots.map((bot) => (
          <PlatformPressable
            key={bot.bot_id}
            style={[
              styles.bot,
              selectedBot?.bot_id === bot.bot_id &&
                styles.selectedBot,
            ]}
            onPress={(ev) => handleBotPress(bot)}
          >
            <IconSymbol
              name="cpu"
              color="#555"
              size={120}
              style={styles.botIcon}
            ></IconSymbol>
            <ThemedText style={styles.botText}>{bot.name}</ThemedText>
          </PlatformPressable>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  botContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    width: "100%",
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
    width: "45%",
    height: 180,
    aspectRatio: 1,
    padding: 5,
    margin: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  botText: {
    fontSize: 24,
    padding: 10,
    textAlign: "center",
  },
});
