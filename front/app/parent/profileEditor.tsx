import {
  Image,
  ScrollView,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Profile, fetchProfile, upsertProfile } from "@/api/profiles";
import { fieldMessage } from "@/api/fieldErrors";
import alert from "@/components/Alert";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedButton } from "@/components/ThemedButton";
import {
  getSelectedProfile,
  setSelectedProfile as storeSelectedProfile,
} from "@/hooks/useSelectedProfile";
import * as Sentry from "@sentry/react-native";

export default function ProfileEditor() {
  const navigation = useNavigation();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  // Pending photo edits: a new local image URI, or a flag to clear the
  // saved photo. Applied on save via multipart; null/null means no change.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
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
        const payload = {
          ...profile,
          oauth_email: profile.oauth_email?.trim()
            ? profile.oauth_email.trim()
            : null,
        };
        const response = photoUri || photoRemoved
          ? await upsertProfile(payload, {
              photoUri,
              removePhoto: photoRemoved && !photoUri,
            })
          : await upsertProfile(payload);
        if (!response || !response.ok) {
          // A taken teen sign-in email comes back as a 400 with an
          // `oauth_email` body: stay on the screen and say so inline
          // instead of backing out as if the save had worked.
          if (response && fieldMessage(response.data, "oauth_email")) {
            setEmailTaken(true);
            return;
          }
          Sentry.captureException(
            new Error(`Save profile failed (${response?.status ?? "offline"})`)
          );
          alert("Couldn't save profile", "Please try again.", [
            { text: "OK", onPress: () => {} },
          ]);
          return;
        }
        // Keep the header/switcher chip in sync when the edited profile is
        // the selected one (it caches the full profile, now with photo_url).
        try {
          const saved = response.data as Profile;
          const selected = await getSelectedProfile();
          if (selected && saved && saved.profile_id === selected.profile_id) {
            await storeSelectedProfile(saved);
          }
        } catch (error) {
          Sentry.captureException(error);
        }
        router.back();
      } catch (error) {
        Sentry.captureException(error);
      }
    }
  }, [photoRemoved, photoUri, profile, router, validateProfile]);

  const pickPhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert("Photo access needed", "Allow photo access to add a profile photo.", [
          { text: "OK", onPress: () => {} },
        ]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled) {
        setPhotoUri(result.assets[0].uri);
        setPhotoRemoved(false);
      }
    } catch (error) {
      Sentry.captureException(error);
    }
  }, []);

  const removePhoto = useCallback(() => {
    setPhotoUri(null);
    setPhotoRemoved(true);
  }, []);

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

  const displayPhotoUrl = photoUri ?? (photoRemoved ? null : profile?.photo_url ?? null);

  return profile ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 80 })}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.photoGroup}>
            {displayPhotoUrl ? (
              <Image
                testID="profile-photo-preview"
                source={{ uri: displayPhotoUrl }}
                style={styles.photoPreview}
              />
            ) : (
              <ProfileAvatar
                profile={{ name: profile.name || "?", photo_url: null }}
                size={96}
                backgroundColor={iconColor}
                testID="profile-photo-preview"
              />
            )}
            <Pressable
              onPress={pickPhoto}
              testID="profile-photo-add"
              style={styles.photoButton}
            >
              <IconSymbol
                name="camera.fill"
                color={buttonIconColor}
                size={20}
                style={styles.buttonIcon}
              ></IconSymbol>
              <ThemedText>{displayPhotoUrl ? "Change photo" : "Add photo"}</ThemedText>
            </Pressable>
            {displayPhotoUrl ? (
              <Pressable
                onPress={removePhoto}
                testID="profile-photo-remove"
                style={styles.photoButton}
              >
                <IconSymbol
                  name="trash"
                  color={buttonIconColor}
                  size={20}
                  style={styles.buttonIcon}
                ></IconSymbol>
                <ThemedText>Remove photo</ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>
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
            <ThemedText style={styles.label}>Student sign-in email</ThemedText>
            <ThemedTextInput
              testID="teen-signin-email-input"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="maya@school.edu"
              style={[styles.input, emailInvalid || emailTaken ? styles.missing : {}]}
              value={profile.oauth_email ?? ""}
              onChangeText={(text) => {
                setEmailTaken(false);
                setProfile({ ...profile, oauth_email: text });
              }}
            />
            {emailTaken ? (
              <ThemedText
                testID="teen-signin-email-taken"
                style={styles.takenText}
              >
                That email is already used by another profile.
              </ThemedText>
            ) : null}
            <ThemedText style={styles.helpText}>
              Your student can sign in with this Google or Apple email on their
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
                <ThemedText>Remove student sign-in</ThemedText>
              </Pressable>
            ) : null}
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
  photoGroup: {
    width: "100%",
    marginBottom: 15,
    alignItems: "center",
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
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
  takenText: {
    fontSize: 13,
    color: "#E63946",
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
