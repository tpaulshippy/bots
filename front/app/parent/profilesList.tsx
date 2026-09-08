import { FlatList, StyleSheet, Pressable, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { fetchProfiles, Profile } from "@/api/profiles";
import * as Haptics from "expo-haptics";
import { IconSymbol } from "@/components/ui/IconSymbol";
import {
  useFocusEffect,
  useNavigation,
  useRouter,
} from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  getSelectedProfile,
  setSelectedProfile as storeSelectedProfile,
} from "@/hooks/useSelectedProfile";
import * as Sentry from "@sentry/react-native";

export default function ProfilesList() {
  const navigation = useNavigation();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "cardBackground");
  const bgColorSelected = useThemeColor({}, "cardBackgroundSelected");
  const refresh = async () => {
    fetchProfiles().then((data) => {
      if (!data) {
        return;
      }
      setProfiles(data.results);
    });
    const loadSelectedProfile = async () => {
      try {
        const profile = await getSelectedProfile();
        if (profile) {
          setSelectedProfile(profile);
        }
      } catch (error) {
        Sentry.captureException(error);
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
    try {
      if (
        selectedProfile &&
        selectedProfile.profile_id === profile.profile_id
      ) {
        setSelectedProfile(null);
        await storeSelectedProfile(null);
        return;
      } else {
        setSelectedProfile(profile);
        await storeSelectedProfile(profile);
        // Pop just this screen; the old double router.back() also closed
        // whatever screen opened Profiles (e.g. Settings).
        router.dismiss();
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText
        style={styles.hint}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        Tap to select. Long-press or tap ✎ to edit.
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
            style={[
              styles.profileCard,
              selectedProfile?.profile_id === item.profile_id ?
                { backgroundColor: bgColorSelected } : { backgroundColor: bgColor },
            ]}
            onPress={() => handleProfilePress(item)}
            onLongPress={() => editProfile(item)}
          >
            <IconSymbol
              name="person.fill"
              color="#555"
              size={80}
              style={styles.profileIcon}
            ></IconSymbol>
            <ThemedText style={styles.profileText}>{item.name}</ThemedText>
          </Pressable>
          <Pressable
            testID={`profile-edit-${item.name}`}
            accessibilityLabel={`Edit ${item.name}`}
            accessibilityRole="button"
            hitSlop={12}
            style={styles.editButton}
            onPress={() => editProfile(item)}
          >
            <IconSymbol
              name="pencil"
              color="#fff"
              size={14}
            ></IconSymbol>
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
  titleContainer: {
    flexDirection: "row",
    fontSize: 16,
  },
  profileCard: {
    width: "100%",
    height: 100,
    aspectRatio: 1,
    padding: 5,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  cardWrapper: {
    margin: 5,
    position: "relative",
  },
  editButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
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
