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
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import * as Progress from "react-native-progress";
import * as Haptics from "expo-haptics";
import { useThemeColor } from "@/hooks/useThemeColor";
import { MenuItem } from "@/components/MenuItem";
import { IconSymbol, IconSymbolName } from "@/components/ui/IconSymbol";
import { clearUser } from "@/api/tokens";

import { subscriptionNames } from "@/constants/subscriptions";
import * as Updates from "expo-updates";

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [percentUsedToday, setPercentUsedToday] = useState(0);
  const [subscriptionLevel, setSubscriptionLevel] = useState(0);
  const [subscription, setSubscription] = useState("");
  const backgroundColor = useThemeColor({}, "cardBackground");
  const tintColor = useThemeColor({}, "tint");
  const trackColor = useThemeColor(
    { light: "#e6e6e6", dark: "#2c2c2e" },
    "background"
  );
  const destructiveColor = useThemeColor(
    { light: "#FF3B30", dark: "#FF453A" },
    "text"
  );
  const actionColor = useThemeColor({ dark: "#00a4c9" }, "tint");

  useEffect(() => {
    getAccount().then((account) => {
      if (account) {
        setHasPin(!!account.hasPin);
        const percent = (account.cost ?? 0) / (account.maxDailyCost || 1);
        setPercentUsedToday(percent);
        if (account.subscriptionLevel !== undefined) {
          setSubscription(subscriptionNames[account.subscriptionLevel]);
          setSubscriptionLevel(account.subscriptionLevel);
        }
      }
      setLoading(false);
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
          {loading || hasPin === null ? (
            <ThemedView style={styles.loadingContainer}>
              <ActivityIndicator />
            </ThemedView>
          ) : !hasPin ? (
            // No PIN yet: block everything behind PIN setup so parent
            // controls can never be left ungated accidentally.
            <ThemedView
              style={[{ backgroundColor }, styles.setPinCard]}
              testID="set-pin-blocking-card"
            >
              <IconSymbol
                name="lock.fill"
                size={28}
                color={tintColor}
                style={styles.setPinIcon}
              />
              <ThemedText style={styles.setPinTitle}>
                Set a PIN to protect parent controls
              </ThemedText>
              <ThemedText style={styles.setPinBody}>
                Your PIN is required to open settings and make changes.
              </ThemedText>
              <Pressable
                style={[{ borderColor: tintColor }, styles.setPinButton]}
                testID="set-pin-button"
                onPress={() => goTo("/parent/setPin")}
              >
                <ThemedText style={[{ color: tintColor }, styles.setPinButtonText]}>
                  Set a PIN
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <PinWrapper onUnlocked={() => undefined}>
              <ThemedView style={[{ backgroundColor }, styles.usageContainer]}>
                <ThemedText>You have the {subscription} subscription.</ThemedText>
                <Progress.Bar
                  height={20}
                  width={null}
                  color={tintColor}
                  unfilledColor={trackColor}
                  borderColor={trackColor}
                  borderRadius={10}
                  style={styles.progressBar}
                  progress={percentUsedToday}
                />
                <ThemedText style={styles.usageText}>
                  {(percentUsedToday * 100).toFixed(2)}% of available tokens used
                  today
                </ThemedText>
              </ThemedView>
              <ThemedView style={[{ backgroundColor }, styles.menuContainer]}>
                <MenuItem
                  title="Profiles"
                  iconName="person.fill"
                  testID="menu-profiles"
                  onPress={() => goTo("/parent/profilesList")}
                ></MenuItem>
                <MenuItem
                  title="Bots"
                  iconName="cpu"
                  testID="menu-item-bots"
                  onPress={() => goTo("/parent/botsList")}
                ></MenuItem>
                <MenuItem
                  title="Notifications"
                  iconName="bell.fill"
                  testID="menu-item-notifications"
                  onPress={() => goTo("/parent/notifications")}
                ></MenuItem>
                <MenuItem
                  title="Subscription"
                  iconName="dollarsign.circle.fill"
                  testID="menu-item-subscription"
                  onPress={() => goTo("/parent/subscription")}                
                />
                <MenuItem
                  title="Set Pin"
                  iconName="lock.fill"
                  testID="menu-item-set-pin"
                  onPress={() => goTo("/parent/setPin")}
                ></MenuItem>
                <MenuItem
                  title="Terms of Use and Privacy Policy"
                  iconName="questionmark.circle.fill"
                  testID="menu-item-terms"
                  onPress={() => goTo("/parent/terms")}
                ></MenuItem>
                <ActionRow
                  title="Delete Account"
                  iconName="trash.fill"
                  color={destructiveColor}
                  showChevron
                  testID="menu-item-delete-account"
                  onPress={() => goTo("/parent/deleteAccount")}
                />
                <ActionRow
                  title="Log Out"
                  iconName="arrowshape.turn.up.left.fill"
                  color={actionColor}
                  testID="menu-item-log-out"
                  onPress={handleLogout}
                />
              </ThemedView>
            </PinWrapper>
          )}
          <ThemedText style={styles.updateId}>
            Update: {Updates.updateId || "default"}
          </ThemedText>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ActionRowProps = {
  title: string;
  iconName: IconSymbolName;
  color: string;
  onPress?: () => void;
  showChevron?: boolean;
  testID?: string;
};

function ActionRow({
  title,
  iconName,
  color,
  onPress,
  showChevron = false,
  testID,
}: ActionRowProps) {
  const backgroundColor = useThemeColor({}, "cardBackground");
  const separatorColor = useThemeColor(
    { light: "#ddd", dark: "#444" },
    "background"
  );
  return (
    <Pressable
      style={[{ backgroundColor }, styles.actionRowContainer]}
      onPress={onPress}
      testID={testID}
    >
      <IconSymbol name={iconName} style={styles.actionRowIcon} color={color} />
      <ThemedView
        style={[
          { backgroundColor, borderColor: separatorColor },
          styles.actionRowRight,
          showChevron ? styles.actionRowBorder : null,
        ]}
      >
        <ThemedText style={[styles.actionRowTitle, { color }]}>
          {title}
        </ThemedText>
        {showChevron && (
          <IconSymbol
            name="chevron.right"
            size={18}
            style={styles.actionRowIcon}
            color={separatorColor}
          />
        )}
      </ThemedView>
    </Pressable>
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
  setPinCard: {
    alignItems: "center",
    margin: 10,
    padding: 24,
    borderRadius: 10,
    gap: 8,
  },
  setPinIcon: {
    marginBottom: 4,
  },
  setPinTitle: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  setPinBody: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: "center",
  },
  setPinButton: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  setPinButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  progressBar: {
    marginTop: 8,
  },
  actionRowContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 10,
  },
  actionRowRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
  },
  actionRowIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  actionRowTitle: {
    flex: 12,
    fontSize: 16,
  },
  usageText: {
    fontSize: 12,
    marginTop: 8,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  updateId: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
    opacity: 0.5,
  },
});
