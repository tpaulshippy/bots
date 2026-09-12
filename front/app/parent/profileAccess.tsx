/**
 * Per-profile bot allowlist editor (roadmap-09).
 *
 * Screen: /parent/profileAccess?profileId=…&title=…
 */
import { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ThemedButton";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { botColor, botIcon } from "@/constants/botAppearance";
import { fetchBots, Bot } from "@/api/bots";
import {
  fetchProfileAccess,
  updateProfileAccess,
  ProfileAccess,
} from "@/api/profiles";
import * as Sentry from "@sentry/react-native";

export default function ProfileAccessEditor() {
  const navigation = useNavigation();
  const router = useRouter();
  const local = useLocalSearchParams<{
    profileId: string;
    title: string;
  }>();
  const profileId = local.profileId ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allBots, setAllBots] = useState<Bot[]>([]);
  const [access, setAccess] = useState<ProfileAccess>({
    access_mode: "all",
    bot_ids: [],
  });

  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "cardBackground");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [botsRes, accessRes] = await Promise.all([
          fetchBots(),
          fetchProfileAccess(profileId),
        ]);
        if (cancelled) return;
        setAllBots(botsRes?.results ?? []);
        if (accessRes) setAccess(accessRes);
      } catch (e) {
        Sentry.captureException(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const toggleBot = useCallback(
    (botId: string) => {
      setAccess((prev) => {
        const has = prev.bot_ids.includes(botId);
        return {
          ...prev,
          bot_ids: has
            ? prev.bot_ids.filter((id) => id !== botId)
            : [...prev.bot_ids, botId],
        };
      });
    },
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateProfileAccess(profileId, access);
      router.back();
    } catch (e) {
      Sentry.captureException(e);
    } finally {
      setSaving(false);
    }
  }, [access, profileId, router]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          {local.title ?? "Tutor Access"}
        </ThemedText>

        {/* Toggle: All vs Selected */}
        <ThemedView style={styles.radioGroup}>
          <Pressable
            testID="access-all"
            style={styles.radioRow}
            onPress={() =>
              setAccess((prev) => ({ ...prev, access_mode: "all", bot_ids: [] }))
            }
          >
            <ThemedText style={styles.radioCircle}>
              {access.access_mode === "all" ? "●" : "○"}
            </ThemedText>
            <ThemedText style={styles.radioLabel}>
              All tutors on this account
            </ThemedText>
          </Pressable>

          <Pressable
            testID="access-allowlist"
            style={styles.radioRow}
            onPress={() =>
              setAccess((prev) => ({ ...prev, access_mode: "allowlist" }))
            }
          >
            <ThemedText style={styles.radioCircle}>
              {access.access_mode === "allowlist" ? "●" : "○"}
            </ThemedText>
            <ThemedText style={styles.radioLabel}>
              Only selected tutors
            </ThemedText>
          </Pressable>
        </ThemedView>

        {/* Bot checklist (visible when allowlist mode) */}
        {access.access_mode === "allowlist" && (
          <ThemedView style={[styles.botList, { backgroundColor: bgColor }]}>
            {allBots.map((bot) => {
              const selected = access.bot_ids.includes(bot.bot_id);
              return (
                <Pressable
                  key={bot.bot_id}
                  testID={`bot-toggle-${bot.bot_id}`}
                  style={styles.botRow}
                  onPress={() => toggleBot(bot.bot_id)}
                >
                  <ThemedText style={styles.checkMark}>
                    {selected ? "✓" : " "}
                  </ThemedText>
                  <ThemedView
                    style={[
                      styles.botIconCircle,
                      { backgroundColor: botColor(bot) },
                    ]}
                  >
                    <IconSymbol
                      name={botIcon(bot)}
                      color="#fff"
                      size={24}
                    />
                  </ThemedView>
                  <ThemedText style={styles.botName}>{bot.name}</ThemedText>
                </Pressable>
              );
            })}
          </ThemedView>
        )}

        {/* Save */}
        <ThemedButton
          testID="access-save"
          darkColor="#0a7ea4"
          style={styles.saveButton}
          onPress={save}
          disabled={saving}
        >
          <ThemedText style={styles.saveButtonText}>
            {saving ? "Saving…" : "Save"}
          </ThemedText>
        </ThemedButton>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { padding: 20 },
  title: { textAlign: "center", marginBottom: 16 },
  radioGroup: { marginBottom: 20 },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  radioCircle: { fontSize: 22, width: 30, textAlign: "center" },
  radioLabel: { fontSize: 16, flex: 1 },
  botList: { borderRadius: 10, padding: 8, marginBottom: 20 },
  botRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  checkMark: { fontSize: 20, width: 28, textAlign: "center" },
  botIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  botName: { fontSize: 16, flex: 1 },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center" as const,
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
