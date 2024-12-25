import { SwipeListView } from 'react-native-swipe-list-view';
import { StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";

export default function BotsScreen({}) {
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

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer}>Bots</ThemedText>
      <ThemedView style={styles.botContainer}>
        <SwipeListView
          data={bots}
          keyExtractor={(item) => item.bot_id}
          renderItem={({ item }) => (
            <ThemedView style={styles.botItemContainer}>
              <ThemedText style={styles.botText}>{item.name}</ThemedText>
            </ThemedView>
          )}
          renderHiddenItem={ (data, rowMap) => (
                <ThemedView style={styles.rowBack}>
                  <PlatformPressable
                    onPress={() => console.log(data.item)}
                  >
                    <ThemedText style={styles.button}>Edit</ThemedText>
                  </PlatformPressable>
                </ThemedView>
            )}
            leftOpenValue={0}
            rightOpenValue={-75}
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
    alignItems: 'center',
    backgroundColor: '#555',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
