import { ScrollView, StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import SelectProfile from "./selectProfile";
import SetPin from "./setPin";
import BotsScreen from "./bots";

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <SelectProfile />
        <BotsScreen />
        <SetPin />
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
