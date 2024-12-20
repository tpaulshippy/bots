import { StyleSheet } from "react-native";
import { Link } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useEffect, useState } from "react";
import { fetchProfiles, Profile } from "@/api/profiles";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";

export default function SelectProfile() {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    fetchProfiles().then((data) => {
      setProfiles(data);
    });
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.titleContainer} type="title">
        Select Profile
      </ThemedText>
      <ThemedView style={styles.profileContainer}>
        {profiles.map((profile) => (
          <PlatformPressable
            key={profile.profile_id}
            style={styles.profile}
            onPressIn={(ev) => {
              if (process.env.EXPO_OS === "ios") {
                // Add a soft haptic feedback when pressing down on the tabs.
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
          >
            <ThemedText style={styles.profileText}>{profile.name}</ThemedText>
          </PlatformPressable>
        ))}
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
    marginTop: 40,
  },
  profileContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    width: "100%",
  },
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  profile: {
    width: "45%",
    aspectRatio: 1,
    margin: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgray",
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
