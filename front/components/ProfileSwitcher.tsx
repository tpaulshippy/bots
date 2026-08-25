import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import PinWrapper from "@/components/PinWrapper";
import * as Sentry from "@sentry/react-native";
import { fetchProfiles, type Profile } from "@/api/profiles";
import { getAccount } from "@/api/account";
import { isTeenDelegatedSession } from "@/api/tokens";
import { useThemeColor } from "@/hooks/useThemeColor";
import {
  getSelectedProfile,
  setSelectedProfile as storeSelectedProfile,
} from "@/hooks/useSelectedProfile";

/**
 * Current-kid chip for headers: shows the selected profile, and opens a sheet
 * to switch profiles without going through Settings. "Manage profiles…" is
 * PIN-gated before reaching the full profiles list. Teen delegated sessions
 * get a display-only chip (the parent manages profiles).
 */
export function ProfileSwitcher() {
  const router = useRouter();
  const textColor = useThemeColor({}, "text");
  const tintColor = useThemeColor({}, "tint");
  const cardBackground = useThemeColor({}, "cardBackground");

  const [selected, setSelected] = useState<Profile | null>(null);
  const [visible, setVisible] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [pinGate, setPinGate] = useState<string | null>(null);

  const refreshSelected = useCallback(async () => {
    try {
      setSelected(await getSelectedProfile());
    } catch (error) {
      // Storage read failures shouldn't break the header.
      Sentry.captureException?.(error);
    }
  }, []);

  useEffect(() => {
    refreshSelected();
    isTeenDelegatedSession().then(setReadOnly).catch(() => setReadOnly(false));
  }, [refreshSelected, visible]);

  const openSwitcher = async () => {
    if (readOnly) {
      return;
    }
    setVisible(true);
  };

  const handleSelect = async (profile: Profile) => {
    await storeSelectedProfile(profile);
    setSelected(profile);
    setVisible(false);
  };

  const handleManagePress = async () => {
    try {
      const account = await getAccount();
      const pin = account?.pin?.toString() ?? "";
      if (pin === "") {
        // No PIN configured yet — nothing to gate on.
        setVisible(false);
        router.push("/parent/profilesList");
        return;
      }
      setPinGate(pin);
    } catch (error) {
      setVisible(false);
      Sentry.captureException?.(error);
    }
  };

  const handlePinVerified = () => {
    setPinGate(null);
    setVisible(false);
    router.push("/parent/profilesList");
  };

  if (!selected) {
    return null;
  }

  return (
    <>
      <Pressable testID="profile-switcher-chip" onPress={openSwitcher} style={styles.chip}>
        <View style={[styles.avatar, { backgroundColor: tintColor }]}>
          <ThemedText style={styles.avatarText} lightColor="#fff" darkColor="#fff">
            {selected.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        <ThemedText numberOfLines={1} style={styles.chipName}>
          {selected.name}
        </ThemedText>
        {!readOnly ? (
          <IconSymbol name="chevron.down" color={textColor} size={14} />
        ) : null}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setVisible(false)}
          testID="profile-switcher-backdrop"
        >
          <ThemedView
            style={[styles.sheet, { backgroundColor: cardBackground }]}
          >
            {pinGate !== null ? (
              <PinWrapper correctPin={pinGate} onPinVerified={handlePinVerified} />
            ) : (
              <>
                <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
                  Who's chatting?
                </ThemedText>
                <ProfileOptionsList
                  selectedId={selected.profile_id}
                  onSelect={handleSelect}
                />
                <ThemedButton
                  testID="profile-switcher-manage"
                  style={styles.manageButton}
                  lightColor="#00000008"
                  darkColor="#ffffff14"
                  onPress={handleManagePress}
                >
                  <ThemedText style={styles.manageText}>
                    Manage profiles…
                  </ThemedText>
                </ThemedButton>
              </>
            )}
          </ThemedView>
        </Pressable>
      </Modal>
    </>
  );
}

function ProfileOptionsList({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (profile: Profile) => void;
}) {
  const textColor = useThemeColor({}, "text");
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    fetchProfiles().then((data) => setProfiles(data?.results ?? []));
  }, []);

  return (
    <FlatList
      data={profiles}
      keyExtractor={(item) => item.profile_id}
      style={styles.list}
      renderItem={({ item }) => {
        const isSelected = item.profile_id === selectedId;
        return (
          <Pressable
            testID={`profile-switcher-option-${item.name}`}
            style={styles.option}
            onPress={() => onSelect(item)}
          >
            <View style={styles.optionAvatar}>
              <ThemedText style={styles.optionAvatarText}>
                {item.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={styles.optionName}>{item.name}</ThemedText>
            {isSelected ? (
              <IconSymbol name="checkmark" color={textColor} size={20} />
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 18,
    marginRight: 5,
    maxWidth: 150,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  chipName: {
    fontSize: 15,
    fontWeight: "600",
    marginRight: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  optionAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(127, 127, 127, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  optionAvatarText: {
    fontSize: 16,
    fontWeight: "600",
  },
  optionName: {
    flex: 1,
    fontSize: 16,
  },
  manageButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  manageText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
