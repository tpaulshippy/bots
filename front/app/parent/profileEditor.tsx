import {
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
  Pressable,
  Switch,
} from "react-native";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Profile, fetchProfile, upsertProfile } from "@/api/profiles";
import alert from "@/components/Alert";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedButton } from "@/components/ThemedButton";
import * as Sentry from "@sentry/react-native";

export default function ProfileEditor() {
  const navigation = useNavigation();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const local = useLocalSearchParams();
  const iconColor = useThemeColor({}, "tint");
  const buttonIconColor = useThemeColor({}, "text");

  useEffect(() => {
    let cancelled = false;
    const loadSelectedProfile = async () => {
      const profileId = local.profileId as string;
      if (profileId) {
        const profile = await fetchProfile(profileId);
        if (!cancelled) setProfile(profile);
      } else {
        const newProfile = {
          id: -1,
          profile_id: "",
          name: "",
          oauth_email: null,
          voice_enabled: false,
          deleted_at: null,
        };
        if (!cancelled) setProfile(newProfile);
      }
    };
    loadSelectedProfile();
    return () => { cancelled = true; };
  }, [local.profileId]);

  // Empty means unbound; otherwise it must look like an email address.
  const isValidOauthEmail = (email: string | null | undefined): boolean => {
    if (!email || !email.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const validateProfile = useCallback(async () => {
    setNameMissing(!profile?.name.trim());
    setEmailInvalid(!isValidOauthEmail(profile?.oauth_email));
  }, [profile?.name, profile?.oauth_email]);

  const saveProfile = useCallback(async () => {
    await validateProfile();

    if (profile) {
      if (!profile.name.trim() || !isValidOauthEmail(profile.oauth_email)) {
        return;
      }
      try {
        await upsertProfile({
          ...profile,
          oauth_email: profile.oauth_email?.trim()
            ? profile.oauth_email.trim()
            : null,
        });
        router.back();
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  }, [profile, router, validateProfile]);

  const removeTeenSignIn = useCallback(() => {
    if (profile?.oauth_email) {
      setProfile({ ...profile, oauth_email: null });
    }
  }, [profile]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={saveProfile} testID="save-profile-button">
          <IconSymbol
            name="checkmark"
            color={iconColor}
            size={40}
            style={styles.saveIcon}
          ></IconSymbol>
        </Pressable>
      ),
    });
  }, [iconColor, navigation, saveProfile]);

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
              testID="profile-name-input"
              style={[styles.input, nameMissing ? styles.missing : {}]}
              value={profile.name}
              onChangeText={(text) => setProfile({ ...profile, name: text })}
            />
          </ThemedView>
          <ThemedView style={styles.formGroup}>
            <ThemedText style={styles.label}>Teen sign-in email</ThemedText>
            <ThemedTextInput
              testID="teen-signin-email-input"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="maya@school.edu"
              style={[styles.input, emailInvalid ? styles.missing : {}]}
              value={profile.oauth_email ?? ""}
              onChangeText={(text) =>
                setProfile({ ...profile, oauth_email: text })
              }
            />
            <ThemedText style={styles.helpText}>
              Your child can sign in with this Google or Apple email on their
              own device. They will only see their chats and flashcards — not
              Settings, bots, or billing.
            </ThemedText>
            {profile.id > 0 && profile.oauth_email ? (
              <Pressable
                onPress={removeTeenSignIn}
                testID="remove-teen-signin-button"
                style={styles.removeButton}
              >
                <IconSymbol
                  name="minus.circle.fill"
                  color={buttonIconColor}
                  size={20}
                  style={styles.buttonIcon}
                ></IconSymbol>
                <ThemedText>Remove teen sign-in</ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>
          {profile.id > 0 ? (
            <>
              <ThemedButton
                testID="profile-access-btn"
                onPress={() =>
                  router.push({
                    pathname: "/parent/profileAccess",
                    params: {
                      title: `${profile.name} · Tutors`,
                      profileId: profile.profile_id,
                    },
                  })
                }
                style={styles.button}
              >
                <IconSymbol
                  name="list.bullet"
                  color={buttonIconColor}
                  size={40}
                  style={styles.buttonIcon}
                />
                <ThemedText>Tutor Access</ThemedText>
              </ThemedButton>

              <ThemedButton
                testID="profile-schedule-btn"
                onPress={() =>
                  router.push({
                    pathname: "/parent/profileSchedule",
                    params: {
                      title: `${profile.name} · Schedule`,
                      profileId: profile.profile_id,
                    },
                  })
                }
                style={styles.button}
              >
                <IconSymbol
                  name="clock"
                  color={buttonIconColor}
                  size={40}
                  style={styles.buttonIcon}
                />
                <ThemedText>Schedule</ThemedText>
              </ThemedButton>

              <ThemedView style={styles.formGroupCheckbox}>
                <ThemedText style={styles.checkboxLabel}>Allow Voice</ThemedText>
                <Switch
                  testID="allow-voice-switch"
                  value={profile.voice_enabled ?? false}
                  onValueChange={(value) =>
                    setProfile({ ...profile, voice_enabled: value })
                  }
                />
              </ThemedView>

              <ThemedButton onPress={() => deleteProfile()} style={styles.button}>
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
  helpText: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 5,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
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
