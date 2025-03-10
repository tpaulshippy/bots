import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { StyleSheet, ScrollView, Alert, Platform, Linking } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useEffect, useState } from "react";
import Purchases from "react-native-purchases";
import { getAccount } from "@/api/account";
import { useRouter, Stack } from "expo-router";
import * as Sentry from "@sentry/react-native";

import { SUBSCRIPTION_LEVELS, SUBSCRIPTION_INFO } from "@/constants/subscriptions";

export default function SubscriptionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const backgroundColor = useThemeColor({}, "cardBackground");
  const [currentLevel, setCurrentLevel] = useState(SUBSCRIPTION_LEVELS.FREE || 0);

  useEffect(() => {
    let isMounted = true;

    const setupPurchases = async () => {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        if (!isMounted) return;

        try {
          const account = await getAccount();
          if (!account) return;

          Purchases.configure({
            apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY,
            appUserID: account.userId.toString(),
          });

          if (account.subscriptionLevel !== undefined) {
            setCurrentLevel(account.subscriptionLevel);
          }
        } catch (e) {
          console.error("Error configuring Purchases:", e);
        }
      }
    };

    setupPurchases();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubscribe = async (level: number) => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert("Error", "Subscriptions are only available on mobile devices.");
      return;
    }

    try {
      setLoading(true);
      if (level === SUBSCRIPTION_LEVELS.FREE) {
        // Open https://support.apple.com/en-us/118428
        // If you want to cancel a subscription from Apple
        Linking.openURL("https://support.apple.com/en-us/118428");
        return;
      }
      const offerings = await Purchases.getOfferings();
      if (!offerings.current) return;

      const packageToBuy = level === SUBSCRIPTION_LEVELS.BASIC 
        ? offerings.current.availablePackages[0]
        : offerings.all["Plus"].availablePackages[0];

      if (!packageToBuy) {
        Alert.alert("Error", "No available packages found.");
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
      
      if (customerInfo.entitlements.active) {
        // The backend will update the subscription level via RevenueCat webhook
        Alert.alert(
          "Success",
          `You are now subscribed to the ${SUBSCRIPTION_INFO[level].name} plan! It may take a few moments to activate.`,
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } catch (e) {
      Sentry.captureException(e);
    } finally {
      setLoading(false);
    }
  };

  const renderSubscriptionOption = (level: number) => (
    <ThemedView
      key={level}
      style={[
        styles.subscriptionCard,
        { backgroundColor },
        currentLevel === level && styles.selectedCard,
      ]}
    >
      <ThemedText style={styles.planName}>{SUBSCRIPTION_INFO[level].name}</ThemedText>
      <ThemedText style={styles.price}>{SUBSCRIPTION_INFO[level].price}</ThemedText>
      <ThemedText style={styles.description}>
        {SUBSCRIPTION_INFO[level].description}
      </ThemedText>
      <ThemedText style={styles.limit}>
        Daily Limit: {SUBSCRIPTION_INFO[level].dailyLimit}
      </ThemedText>
      {
        <ThemedButton
          style={styles.subscribeButton}
          onPress={() => handleSubscribe(level)}
          disabled={loading || currentLevel === level}
        >
          <ThemedText>
            {currentLevel === level ? "Current Plan" : level === SUBSCRIPTION_LEVELS.FREE ? "Unsubscribe" : "Subscribe"}
          </ThemedText>
        </ThemedButton>
      }
    </ThemedView>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Upgrade Your Plan",
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
      {Object.values(SUBSCRIPTION_LEVELS).map(renderSubscriptionOption)}
      <ThemedText style={styles.footnote}>* Token estimates based on Nova Lite model usage</ThemedText>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },

  subscriptionCard: {
    padding: 20,
    borderRadius: 10,
    gap: 10,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  planName: {
    fontSize: 20,
    fontWeight: "bold",
  },
  price: {
    fontSize: 24,
    fontWeight: "bold",
  },
  description: {
    fontSize: 16,
  },
  limit: {
    fontSize: 14,
    opacity: 0.8,
  },
  subscribeButton: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  footnote: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 20,
  },
});
