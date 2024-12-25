import { ScrollView, StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import SelectProfile from "../screens/selectProfile";
import Settings from "../screens/settings";
import BotsScreen from "../screens/bots";

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <SelectProfile />
        <BotsScreen />
        <Settings />
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {},
  scrollContainer: {
    flexGrow: 1,
  },
});
