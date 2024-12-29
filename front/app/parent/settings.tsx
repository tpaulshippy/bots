import PinWrapper from "@/components/PinWrapper";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import SelectProfile from "./selectProfile";
import SetPin from "./setPin";
import BotsList from "./botsList";
import { getAccount } from "@/api/account";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Progress from "react-native-progress";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function SettingsScreen() {
  const router = useRouter();
  const [correctPin, setCorrectPin] = useState("");
  const [percentUsedToday, setPercentUsedToday] = useState(0);

  useEffect(() => {
    getAccount().then((account) => {
      if (account) {
        setCorrectPin(account.pin?.toString());
        const percent = (account.costForToday || 0) / (account.maxDailyCost || 1);
        setPercentUsedToday(percent);
      }
    });
  }, []);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.usageContainer}>
            <Progress.Bar
              width={230}
              height={20}
              style={styles.progressBar}
              progress={percentUsedToday}
            />
            <ThemedText style={styles.usageText}>
              {(percentUsedToday * 100).toFixed(2)}% of available tokens used
              today
            </ThemedText>
          </ThemedView>
          {correctPin != "" ? (
            <PinWrapper correctPin={correctPin}>
              <ThemedView style={styles.container}>
                <SelectProfile />
                <BotsList />
                <SetPin />
              </ThemedView>
            </PinWrapper>
          ) : (
            <ThemedView>
              <ActivityIndicator style={{ marginTop: 10 }} />
              <ThemedButton
                onPress={() => {
                  AsyncStorage.removeItem("loggedInUser");
                  router.navigate("/login");
                }}
              >
                <ThemedText>Log Out</ThemedText>
              </ThemedButton>
            </ThemedView>
          )}
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {},
  usageContainer: {
    margin: 10,
  },
  progressBar: {
    color: "#BBB",
    borderColor: "#BBB",
  },
  usageText: {
    fontSize: 12,
  },
  scrollContainer: {
    flexGrow: 1,
  },
});
