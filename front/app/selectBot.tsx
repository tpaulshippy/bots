import { StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { ThemedButton } from "@/components/ThemedButton";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";

type Props = {
  setBotSelected?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function SelectBot({ setBotSelected }: Props) {
  const buttonColor = useThemeColor({}, "tint");
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);

  useEffect(() => {
    fetchBots().then((data) => {
      setBots(data.results);
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

    if (!setBotSelected) // When the component is used in the child app, require them to select a bot
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
        if (setBotSelected)
          setBotSelected(true);
        await AsyncStorage.setItem("selectedBot", JSON.stringify(bot));
      }
    } catch (error) {
      console.error("Failed to save the bot to local storage", error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer}>Select bot</ThemedText>
      <ThemedView style={styles.botContainer}>
        {bots.map((bot) => (
          <ThemedButton
            key={bot.bot_id}
            style={[
              styles.bot,
              { backgroundColor: buttonColor },
              selectedBot?.bot_id === bot.bot_id &&
                styles.selectedBot,
            ]}
            onPress={() => handleBotPress(bot)}
          >
            <IconSymbol
              name="cpu"
              color="#fff"
              size={120}
              style={styles.botIcon}
            ></IconSymbol>
            <ThemedText style={styles.botText}>{bot.name}</ThemedText>
          </ThemedButton>
        ))}
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
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  botText: {
    fontSize: 24,
    paddingTop: 10,
    textAlign: "center",
  },
  botDescription: {
    fontSize: 12,
    textAlign: "center",
  }
});
