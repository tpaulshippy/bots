import { FlatList, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { router } from "expo-router";

export default function BotScreen({}) {
  const [bot, setBot] = useState<Bot | null>(null);

  useEffect(() => {
      const loadSelectedBot = async () => {
        const botData = await AsyncStorage.getItem("selectedBot");
        if (botData) {
          const bot = JSON.parse(botData);
          setBot(bot);
        }
      };

      loadSelectedBot();    
  }, []);


  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer}>{bot ? bot.name : null}</ThemedText>
      <ThemedView style={styles.botContainer}>
        <ThemedText>
          {bot ? bot.system_prompt : null}
        </ThemedText>
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
  button: {
    color: "#fff",
  },
});
