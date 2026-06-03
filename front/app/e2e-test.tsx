import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { setTokens } from "@/api/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator } from "react-native";

export default function E2ETestSetup() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const setup = async () => {
      const access = params.access as string;
      const refresh = params.refresh as string;
      const profile = params.profile as string;
      const bot = params.bot as string;

      if (access && refresh) {
        await setTokens({ access, refresh });
      }
      if (profile) {
        await AsyncStorage.setItem("selectedProfile", profile);
      }
      if (bot) {
        await AsyncStorage.setItem("selectedBot", bot);
      }
      await AsyncStorage.setItem("e2eTestMode", "true");

      router.replace("/chat");
    };

    setup();
  }, [router, params]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
