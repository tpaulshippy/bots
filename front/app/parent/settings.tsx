import PinWrapper from "@/components/PinWrapper";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { getAccount } from "@/api/account";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Progress from "react-native-progress";
import * as Haptics from "expo-haptics";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MenuItem } from "@/components/MenuItem";

const subscriptionNames: { [key: string]: string } = {
  0: "Free",
  1: "Basic",
  2: "Plus"
};

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [correctPin, setCorrectPin] = useState("");
  const [percentUsedToday, setPercentUsedToday] = useState(0);
  const [subscriptionLevel, setSubscriptionLevel] = useState(0);
  const [subscription, setSubscription] = useState("");

  useEffect(() => {
    getAccount().then((account) => {
      if (account) {
        setCorrectPin(account.pin?.toString());
        const percent =
          (account.costForToday || 0) / (account.maxDailyCost || 1);
        setPercentUsedToday(percent);
        if (account.subscriptionLevel !== undefined)
        {
          setSubscription(subscriptionNames[account.subscriptionLevel]);
          setSubscriptionLevel(account.subscriptionLevel);
        }
        setLoading(false);
      }
    });
  }, []);

  const goTo = (
    path:
      | "/parent/profilesList"
      | "/parent/botsList"
      | "/parent/setPin"
      | "/login"
  ) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.navigate({
      pathname: path,
      params: { subscriptionLevel: subscriptionLevel },
    });
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.usageContainer}>
            <ThemedText>You have the {subscription} subscription.</ThemedText>
            <Progress.Bar
              height={20}
              width={null}
              color={useThemeColor({}, "tint")}
              style={styles.progressBar}
              progress={percentUsedToday}
            />
            <ThemedText style={styles.usageText}>
              {(percentUsedToday * 100).toFixed(2)}% of available tokens used
              today
            </ThemedText>
          </ThemedView>
          {loading ? (
            <ThemedView style={styles.loadingContainer}>
              <ActivityIndicator />
              <ThemedButton
                style={styles.logOutButton}
                onPress={() => {
                  AsyncStorage.removeItem("loggedInUser");
                  router.navigate("/login");
                }}
              >
                <ThemedText>Log Out</ThemedText>
              </ThemedButton>
            </ThemedView>
          ) : (
            <PinWrapper correctPin={correctPin}>
              <ThemedView style={styles.container}>
                <MenuItem
                  title="Profiles"
                  iconName="person.fill"
                  onPress={() => goTo("/parent/profilesList")}
                ></MenuItem>
                <MenuItem
                  title="Bots"
                  iconName="cpu"
                  onPress={() => goTo("/parent/botsList")}
                ></MenuItem>
                <MenuItem
                  title="Set Pin"
                  iconName="lock.fill"
                  onPress={() => goTo("/parent/setPin")}
                ></MenuItem>
              </ThemedView>
            </PinWrapper>
          )}
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
  },
  logOutButton: {
    marginTop: 10,
    marginLeft: 10,
    padding: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  usageContainer: {
    paddingHorizontal: 20,
    marginVertical: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#666",
  },
  progressBar: {
    
  },
  usageText: {
    fontSize: 12,
  },
  scrollContainer: {
    flexGrow: 1,
  },
});
