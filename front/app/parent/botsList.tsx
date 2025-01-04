import { FlatList, StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";


import { useCallback, useEffect, useState } from "react";
import { fetchBots, Bot } from "@/api/bots";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { MenuItem } from "@/components/MenuItem";

export default function BotsList({}) {
  const [bots, setBots] = useState<Bot[]>([]);
  const router = useRouter();

  const refresh = async () => {
    fetchBots().then((data) => {
      setBots(data.results);
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

  const handleBotPress = async (bot: Bot | null = null) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    router.push({
      pathname: `/parent/botEditor`,
      params: { title: bot?.name || "New Bot", botId: bot?.bot_id || "" },
    });
  };
  

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.botContainer}>
        <FlatList
          scrollEnabled={false}
          data={bots}
          keyExtractor={(item) => item.bot_id}
          renderItem={({ item }) => (
            <MenuItem 
              key={item.bot_id}
              iconName="cpu"
              title={item.name}
              onPress={() => handleBotPress(item)}
            />
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
  addBotButton: {
    marginTop: 10,
    marginLeft: 10,
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,    
  }
});
