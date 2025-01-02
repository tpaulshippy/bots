import {
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Profile, fetchProfile, upsertProfile } from "@/api/profiles";
import alert from "@/components/Alert";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { PlatformPressable } from "@react-navigation/elements";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedButton } from "@/components/ThemedButton";

export default function ProfileEditor() {
  const navigation = useNavigation();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const local = useLocalSearchParams();
  const iconColor = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");

  const loadSelectedProfile = async () => {
    const profileId = local.profileId as string;
    if (profileId) {
      const profile = await fetchProfile(profileId);
      setProfile(profile);
    } else {
      const newProfile = {
        id: -1,
        profile_id: "",
        name: "",
        deleted_at: null,
      };
      setProfile(newProfile);
    }
  };

  useEffect(() => {
    loadSelectedProfile();
  }, []);

  const validateProfile = async () => {
    setNameMissing(!profile?.name.trim());
  };

  const saveProfile = async () => {
    await validateProfile();

    if (profile) {
      try {
        await upsertProfile(profile);
        router.back();
      } catch (error) {
        console.error("Failed to save profile", error);
      }
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <PlatformPressable onPress={saveProfile}>
          <IconSymbol
            name="checkmark"
            color={iconColor}
            size={40}
            style={styles.saveIcon}
          ></IconSymbol>
        </PlatformPressable>
      ),
    });
  }, [navigation, saveProfile]);

  const deleteProfile = async () => {
    alert("Delete Profile", "Are you sure you want to delete this profile?", [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => {},
      },
      {
        text: "Delete",
        onPress: async () => {
          if (profile) {
            profile.deleted_at = new Date();
            await upsertProfile(profile);
            router.back();
          }
        },
      },
    ]);
  };

  return profile ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Name</ThemedText>
            <ThemedTextInput
              autoFocus={true}
              style={[styles.input, nameMissing ? styles.missing : {}]}
              value={profile.name}
              onChangeText={(text) => setProfile({ ...profile, name: text })}
            />
          </ThemedView>
          {profile.id > 0 ? (
            <ThemedButton onPress={() => deleteProfile()} style={styles.button}>
              <IconSymbol
                name="trash"
                color={buttonIconColor}
                size={40}
                style={styles.buttonIcon}
              ></IconSymbol>
              <ThemedText>Delete Profile</ThemedText>
            </ThemedButton>
          ) : null}
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  ) : null;
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: 20,
  },
  formGroup: {
    width: "100%",
    marginBottom: 15,
  },
  formGroupCheckbox: {
    width: "100%",
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  checkboxLabel: {
    fontSize: 16,
    marginBottom: 5,
    marginLeft: 10,
  },
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    padding: 8,
  },
  picker: {
    height: Platform.OS === "web" ? 40 : 200,
    width: "100%",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  textArea: {
    height: 200,
    borderColor: "gray",
    borderWidth: 1,
    paddingLeft: 8,
    textAlignVertical: "top",
  },
  missing: {
    borderColor: "red",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    paddingRight: 20,
    paddingLeft: 10,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonIcon: {
    marginRight: 8,
  },
  saveIcon: {
    marginRight: 5,
  },
});
