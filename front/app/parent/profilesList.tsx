import { FlatList, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { PlatformPressable } from "@react-navigation/elements";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { fetchProfiles, Profile } from "@/api/profiles";
import { ThemedButton } from "@/components/ThemedButton";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { setTokens } from "@/api/tokens";
import { MenuItem } from "@/components/MenuItem";

export default function ProfilesList() {
  const navigation = useNavigation();
  const router = useRouter();
  const local = useLocalSearchParams();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "cardBackground");
  const bgColorSelected = useThemeColor({}, "cardBackgroundSelected");

  const refresh = async () => {
    fetchProfiles().then((data) => {
      setProfiles(data.results);
    });
    const loadSelectedProfile = async () => {
      try {
        const profileData = await AsyncStorage.getItem("selectedProfile");
        if (profileData) {
          const profile = JSON.parse(profileData);
          setSelectedProfile(profile);
        }
      } catch (error) {
        console.error("Failed to load the profile from local storage", error);
      }
    };

    loadSelectedProfile();
  };

  useEffect(() => {
    refresh();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  const newProfile = async () => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/parent/profileEditor",
      params: { title: "New Profile", profileId: "" },
    });
  };

  const editProfile = async (profile: Profile) => {
    router.push({
      pathname: "/parent/profileEditor",
      params: { title: profile.name, profileId: profile.profile_id },
    });
  };

  useLayoutEffect(() => {
    if (!local.subscriptionLevel || profiles.length === 0) {
      return;
    }

    if (local.subscriptionLevel === "1") {
      // Basic subscription - only allow one additional profile.
      if (profiles.length > 1) {
        return;
      }
    }

    navigation.setOptions({
      headerRight: () => (
        <PlatformPressable onPress={newProfile}>
          <IconSymbol
            name="plus.circle.fill"
            color={tintColor}
            size={40}
            style={styles.newIcon}
          ></IconSymbol>
        </PlatformPressable>
      ),
    });
  }, [navigation, profiles, newProfile]);

  const handleProfilePress = async (profile: Profile) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      if (
        selectedProfile &&
        selectedProfile.profile_id === profile.profile_id
      ) {
        setSelectedProfile(null);
        await AsyncStorage.removeItem("selectedProfile");
        return;
      } else {
        setSelectedProfile(profile);
        await AsyncStorage.setItem("selectedProfile", JSON.stringify(profile));
      }
    } catch (error) {
      console.error("Failed to save the profile to local storage", error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        numColumns={2}
        data={profiles}
        renderItem={({ item }) => (
          <PlatformPressable
          key={item.profile_id}
          style={[
            styles.profileCard,
            selectedProfile?.profile_id === item.profile_id ?
              { backgroundColor: bgColorSelected } : { backgroundColor: bgColor },
          ]}
          onPress={(ev) => handleProfilePress(item)}
          onLongPress={() => editProfile(item)}
        >
          <IconSymbol
            name="person.fill"
            color="#555"
            size={80}
            style={styles.profileIcon}
          ></IconSymbol>
          <ThemedText style={styles.profileText}>{item.name}</ThemedText>
        </PlatformPressable>
        )}
      >
        
      </FlatList>
        {profiles.length === 0 && (
          <ThemedButton
            onPress={() => {
              setTokens({ access: "", refresh: "" });
            }}
          >
            <ThemedText style={styles.profileText}>Log out</ThemedText>
          </ThemedButton>
        )}
      
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  profileIcon: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  profileCard: {
    width: "46%",
    height: 100,
    aspectRatio: 1,
    padding: 5,
    margin: 5,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  profileText: {
    fontSize: 24,
    padding: 10,
    textAlign: "center",
  },
  newIcon: {
    marginRight: 5,
  },
});
