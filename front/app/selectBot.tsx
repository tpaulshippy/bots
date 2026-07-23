import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { ThemedButton } from "@/components/ThemedButton";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { botColor, botIcon } from "@/constants/botAppearance";
import * as Sentry from "@sentry/react-native";

type Props = {
  setBotSelected?: React.Dispatch<React.SetStateAction<boolean>>;
  skipAutoSelect?: boolean;
}

export default function SelectBot({ setBotSelected, skipAutoSelect }: Props) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);

  useEffect(() => {
    fetchBots().then((data) => {
      if (!data) {
        return;
      }
      setBots(data.results);
    });
    const loadSelectedBot = async () => {
      try {
        if (skipAutoSelect) {
          await AsyncStorage.removeItem("selectedBot");
          return;
        }
        const botData = await AsyncStorage.getItem("selectedBot");
        if (botData) {
          const bot = JSON.parse(botData);
          setSelectedBot(bot);
        }
      } catch (error) {
        Sentry.captureException(error);
      }
    };

    loadSelectedBot();
  }, [setBotSelected]);

  useEffect(() => {
    if (setBotSelected && selectedBot && !skipAutoSelect) {
      setBotSelected(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBot, skipAutoSelect]);

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
      Sentry.captureException(error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Select bot</ThemedText>
      <ThemedText style={styles.subtitle}>
        Who do you want to learn with today?
      </ThemedText>
      <ThemedView style={styles.botContainer}>
        {bots.map((bot) => (
          <ThemedButton
            key={bot.bot_id}
            style={[
              styles.bot,
              { backgroundColor: botColor(bot) },
              selectedBot?.bot_id === bot.bot_id &&
                styles.selectedBot,
            ]}
            onPress={() => handleBotPress(bot)}
          >
            <View style={styles.iconCircle}>
              <IconSymbol
                name={botIcon(bot)}
                color="#fff"
                size={40}
              ></IconSymbol>
            </View>
            <ThemedText style={styles.botText} numberOfLines={1}>
              {bot.name}
            </ThemedText>
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
    paddingTop: 16,
    paddingHorizontal: 8,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
    marginTop: 4,
    marginBottom: 20,
  },
  botContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
  },
  selectedBot: {
    borderColor: "#fff",
  },
  bot: {
    width: "45%",
    height: 160,
    paddingVertical: 12,
    paddingHorizontal: 8,
    margin: "2%",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 4,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  botText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
