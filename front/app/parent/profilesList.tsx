import { FlatList, StyleSheet, Pressable, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { fetchProfiles, Profile } from "@/api/profiles";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import * as Haptics from "expo-haptics";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  useFocusEffect,
  useNavigation,
  useRouter,
} from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function ProfilesList() {
  const navigation = useNavigation();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "cardBackground");
  const refresh = async () => {
    fetchProfiles().then((data) => {
      if (!data) {
        return;
      }
      setProfiles(data.results);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  const newProfile = useCallback(async () => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/parent/profileEditor",
      params: { title: "New Profile", profileId: "" },
    });
  }, [router]);

  const editProfile = async (profile: Profile) => {
    router.push({
      pathname: "/parent/profileEditor",
      params: { title: profile.name, profileId: profile.profile_id },
    });
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={newProfile}>
          <IconSymbol
            name="plus.circle.fill"
            color={tintColor}
            size={40}
            style={styles.newIcon}
          ></IconSymbol>
        </Pressable>
      ),
    });
  }, [navigation, newProfile, tintColor]);

  const handleProfilePress = async (profile: Profile) => {
    if (process.env.EXPO_OS === "ios") {
      // Add a soft haptic feedback when pressing down on the tabs.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    editProfile(profile);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText
        style={styles.hint}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        Tap a profile to edit its details.
      </ThemedText>
      <FlatList
        numColumns={2}
        data={profiles}
        renderItem={({ item }) => (
          <View
            key={item.profile_id}
            style={[
              profiles.length > 1 ? { width: "46%" } : { width: "65%" },
              styles.cardWrapper,
            ]}
          >
            <Pressable
            testID={`profile-card-${item.name}`}
            accessibilityLabel={`Edit ${item.name}`}
            accessibilityRole="button"
            style={[
              styles.profileCard,
              { backgroundColor: bgColor },
            ]}
            onPress={() => handleProfilePress(item)}
          >
            {item.photo_url ? (
              <ProfileAvatar profile={item} size={96} style={styles.profilePhoto} />
            ) : (
              <IconSymbol
                name="person.fill"
                color="#555"
                size={96}
                style={styles.profileIcon}
              ></IconSymbol>
            )}
            <ThemedText style={styles.profileText}>{item.name}</ThemedText>
          </Pressable>
          </View>
        )}
      >
        
      </FlatList>      
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
  profilePhoto: {
    marginRight: 0,
  },
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  profileCard: {
    width: "100%",
    aspectRatio: 0.85,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
  },
  cardWrapper: {
    margin: 8,
  },
  hint: {
    fontSize: 13,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 16,
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
