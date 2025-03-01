import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { StyleSheet, ScrollView, Alert, Platform } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useEffect, useState } from "react";
import Purchases from "react-native-purchases";
import { updateAccount } from "@/api/account";
import { useRouter, Stack } from "expo-router";

import { SUBSCRIPTION_LEVELS, SUBSCRIPTION_INFO } from "@/constants/subscriptions";

export default function SubscriptionScreen() {
  const router = useRouter();eas env:pull
  const [loading, setLoading] = useState(false);
  const backgroundColor = useThemeColor({}, "cardBackground");
  const [currentLevel, setCurrentLevel] = useState(SUBSCRIPTION_LEVELS.BASIC);

  useEffect(() => {
    let isMounted = true;

    const setupPurchases = async () => {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          await Purchases.configure({ apiKey: process.env.REVENUECAT_API_KEY });
          if (!isMounted) return;

          const { data: account } = await getAccount();
          if (account && isMounted) {
            // Set the app user ID to match our backend user ID
            await Purchases.setAppUserID(account.userId.toString());
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
      const offerings = await Purchases.getOfferings();
      if (!offerings.current) return;

      const packageToBuy = level === SUBSCRIPTION_LEVELS.BASIC 
        ? offerings.current.availablePackages[0]
        : offerings.current.availablePackages[1];

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
      Alert.alert("Error", "Failed to process subscription. Please try again.");
      console.error(e);
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
            {currentLevel === level ? "Current Plan" : "Subscribe"}
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
