import { StyleSheet } from "react-native";
import { Link } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchProfiles, Profile } from "@/api/profiles";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSymbol } from "@/components/ui/IconSymbol";

export default function SelectProfile() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchProfiles().then((data) => {
      setProfiles(data);
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
  }, []);

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
      <ThemedView style={styles.profileContainer}>
        {profiles.map((profile) => (
          <PlatformPressable
            key={profile.profile_id}
            style={[
              styles.profile,
              selectedProfile?.profile_id === profile.profile_id &&
                styles.selectedProfile,
            ]}
            onPress={(ev) => handleProfilePress(profile)}
          >
            <IconSymbol
              name="person.fill"
              color="#555"
              size={120}
              style={styles.profileIcon}
            ></IconSymbol>
            <ThemedText style={styles.profileText}>{profile.name}</ThemedText>
          </PlatformPressable>
        ))}
        {profiles.length === 0 && (
          <PlatformPressable
            onPress={() => {
              AsyncStorage.removeItem("loggedInUser");
            }}
          >
            <ThemedText style={styles.profileText}>Log out</ThemedText>
          </PlatformPressable>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  profileContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    width: "100%",
  },
  profileIcon: {
    flex: 1,
  },
  selectedProfile: {
    backgroundColor: "#444",
  },
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  profile: {
    width: "45%",
    height: 180,
    aspectRatio: 1,
    padding: 5,
    margin: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  profileText: {
    fontSize: 24,
    padding: 10,
    textAlign: "center",
  },
});
