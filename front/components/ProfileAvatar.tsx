import { Image, StyleSheet, View, type ImageStyle } from "react-native";
import { ThemedText } from "@/components/ThemedText";

export interface AvatarProfile {
  name: string;
  photo_url?: string | null;
}

/**
 * Student avatar: the profile photo when one was added, otherwise the
 * first-letter initial in a circle (the previous behavior).
 */
export function ProfileAvatar({
  profile,
  size = 26,
  backgroundColor,
  testID,
  style,
}: {
  profile: AvatarProfile;
  size?: number;
  backgroundColor?: string;
  testID?: string;
  style?: ImageStyle;
}) {
  const radius = size / 2;
  if (profile.photo_url) {
    return (
      <Image
        testID={testID}
        source={{ uri: profile.photo_url }}
        style={[styles.photo, { width: size, height: size, borderRadius: radius }, style]}
        accessibilityLabel={`${profile.name} profile photo`}
      />
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor }, style]}
    >
      <ThemedText style={[styles.fallbackText, { fontSize: size * 0.5 }]} lightColor="#fff" darkColor="#fff">
        {profile.name.charAt(0).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    marginRight: 6,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  fallbackText: {
    fontWeight: "700",
  },
});
