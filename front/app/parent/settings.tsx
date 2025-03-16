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
} from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { useRouter } from "expo-router";
import * as Progress from "react-native-progress";
import * as Haptics from "expo-haptics";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MenuItem } from "@/components/MenuItem";
import { clearUser } from "@/api/tokens";

import { subscriptionNames } from "@/constants/subscriptions";
import Config, { DefaultAppName } from "@/app/config";

const appName = process.env.EXPO_PUBLIC_APP_NAME;
const config = Config()[appName || DefaultAppName];


export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [correctPin, setCorrectPin] = useState<number | null>(null);
  const [percentUsedToday, setPercentUsedToday] = useState(0);
  const [subscriptionLevel, setSubscriptionLevel] = useState(0);
  const [subscription, setSubscription] = useState("");
  const backgroundColor = useThemeColor({}, "cardBackground");

  useEffect(() => {
    getAccount().then((account) => {
      if (account) {
        setCorrectPin(account.pin);
        const percent =
          (account.costForToday?.[0] || 0) / (account.maxDailyCost || 1);
        setPercentUsedToday(percent);
        if (account.subscriptionLevel !== undefined) {
          setSubscription(subscriptionNames[account.subscriptionLevel]);
          setSubscriptionLevel(account.subscriptionLevel);
        }
        setLoading(false);
      }
    });
  }, []);

  const handleLogout = async () => {
    await clearUser();
    router.replace("/login");
  };

  const goTo = (
    path:
      | "/parent/profilesList"
      | "/parent/botsList"
      | "/parent/setPin"
      | "/parent/notifications"
      | "/parent/subscription"
      | "/parent/terms"
      | "/parent/deleteAccount"
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
          <ThemedView style={[{ backgroundColor }, styles.usageContainer]}>
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
                onPress={handleLogout}
              >
                <ThemedText>Log Out</ThemedText>
              </ThemedButton>
            </ThemedView>
          ) : (
            <PinWrapper correctPin={correctPin ? correctPin.toString() : ""}>
              <ThemedView style={[{ backgroundColor }, styles.menuContainer]}>
                {
                  [
                    {
                      title: "Profiles",
                      iconName: "person.fill",
                      onPress: () => goTo("/parent/profilesList"),
                    },
                    {
                      title: "Bots",
                      iconName: "cpu",
                      onPress: () => goTo("/parent/botsList"),
                    },
                    {
                      title: "Notifications",
                      iconName: "bell.fill",
                      onPress: () => goTo("/parent/notifications"),
                    },
                    {
                      title: "Subscription",
                      iconName: "dollarsign.circle.fill",
                      onPress: () => goTo("/parent/subscription"),
                    },
                    {
                      title: "Set Pin",
                      iconName: "lock.fill",
                      onPress: () => goTo("/parent/setPin"),
                    },
                    {
                      title: "Terms of Use and Privacy Policy",
                      iconName: "questionmark.circle.fill",
                      onPress: () => goTo("/parent/terms"),
                    },
                    {
                      title: "Delete Account",
                      iconName: "trash.fill",
                      onPress: () => goTo("/parent/deleteAccount"),
                    },
                    {
                      title: "Log Out",
                      iconName: "arrowshape.turn.up.left.fill",
                      onPress: handleLogout,
                    },
                  ].filter((menuItem) => config.settings.includes(menuItem.title))
                  .map((menuItem) => (
                    <MenuItem {...menuItem} key={menuItem.title} />
                  ))
                }
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
    flexDirection: "column",
  },
  menuContainer: {
    flex: 1,
    flexDirection: "column",
    marginHorizontal: 10,
    borderRadius: 10,
    padding: 4,
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
    margin: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  progressBar: {},
  usageText: {
    fontSize: 12,
  },
  scrollContainer: {
    flexGrow: 1,
  },
});
