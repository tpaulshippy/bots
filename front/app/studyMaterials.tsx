import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import PinWrapper from "@/components/PinWrapper";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useSessionMode } from "@/hooks/useSessionMode";
import {
  getSelectedProfileId,
  handleUnauthorized,
  subscribeToSelectedProfile,
} from "@/hooks/useSelectedProfile";
import { getAccount } from "@/api/account";
import { getCachedHasPin } from "@/api/pinStorage";
import { fetchProfiles, Profile } from "@/api/profiles";
import { fetchHtmlPages, getPageLink, HtmlPageListItem } from "@/api/htmlPages";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import * as Sentry from "@sentry/react-native";
import { formatDistanceToNowStrict } from "date-fns";

/**
 * Study Materials — browsable list of agent-built HTML pages.
 *
 * Teen-delegated sessions are locked to their own profile: no filter chips,
 * no PIN gate. Parent sessions see profile filter chips (like the activity
 * list) and are gated by PinWrapper when the account has a PIN.
 */
export default function StudyMaterials() {
  const router = useRouter();
  const sessionMode = useSessionMode();
  // Fail closed while the claims resolve: unknown sessions render the
  // spinner, never content — a parent with a PIN must not flash ungated
  // pages. (The drawer fails closed the same way.)
  const sessionResolved = sessionMode !== null;
  const isTeenDelegated = sessionMode?.isTeenDelegated ?? true;

  const [pages, setPages] = useState<HtmlPageListItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cardBackground = useThemeColor({}, "cardBackground");
  const borderColor = useThemeColor({}, "border");
  const iconColor = useThemeColor({}, "icon");
  const accentColor = useThemeColor({ dark: "#00a4c9" }, "tint");

  const refresh = useCallback(async () => {
    // No fetching until the session claims resolve: the render gate below
    // holds the spinner meanwhile, so nothing can flash pre-resolution.
    if (!sessionResolved) return;
    setRefreshing(true);
    try {
      if (isTeenDelegated) {
        const lockedId = sessionMode?.activeProfileId ?? (await getSelectedProfileId());
        const data = await fetchHtmlPages(lockedId);
        setPages(data.results || []);
      } else {
        const data = await fetchHtmlPages(selectedProfileId);
        setPages(data.results || []);
      }
    } catch (error) {
      if (!(await handleUnauthorized(error, router))) {
        Sentry.captureException(error);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [sessionResolved, isTeenDelegated, selectedProfileId, sessionMode, router]);

  // Parent mode: load profiles for the filter chips (teens never see them).
  useEffect(() => {
    if (isTeenDelegated) return;
    let active = true;
    fetchProfiles()
      .then((data) => {
        if (active) setProfiles(data?.results || []);
      })
      .catch((error) => {
        Sentry.captureException(error);
      });
    return () => {
      active = false;
    };
  }, [isTeenDelegated]);

  // Teen mode follows the locked profile; parent "All" view stays put.
  useEffect(() => subscribeToSelectedProfile(() => refresh()), [refresh]);

  // Same as the activity list: refetch on mount and whenever the filter
  // callback identity changes (profile chip tapped). The focus effect below
  // additionally refetches when returning to this screen.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Mirror activity.tsx: accounts that opted out of a PIN render parent
  // surfaces directly; PIN accounts go through the PinWrapper gate.
  // Teens skip the account lookup entirely (never gated). Nothing runs
  // until the session claims resolve (see the render gate below).
  useFocusEffect(
    useCallback(() => {
      if (!sessionResolved) return;
      if (isTeenDelegated) {
        setHasPin(false);
        return;
      }
      let active = true;
      getAccount()
        .then((account) => {
          if (!active) return;
          if (account) {
            setHasPin(!!account.hasPin);
          } else {
            // request() resolves null (instead of rejecting) on ordinary
            // HTTP/network failures: fall back to the cached flag so the
            // spinner resolves instead of hanging indefinitely.
            getCachedHasPin().then((cached) => {
              if (active) setHasPin(cached);
            });
          }
        })
        .catch(() => {
          getCachedHasPin().then((cached) => {
            if (active) setHasPin(cached);
          });
        });
      return () => {
        active = false;
      };
    }, [sessionResolved, isTeenDelegated])
  );

  const handlePagePress = (page: HtmlPageListItem) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (Platform.OS === "web") {
      // The in-app viewer is native-only (WebView): open the signed raw URL
      // in a browser tab instead, synchronously in the press handler so
      // popup blockers allow it (same handoff as ChatMessage).
      const win = window.open("about:blank", "_blank");
      if (win) win.opener = null;
      getPageLink(page.page_id)
        .then((url) => {
          if (url && win) win.location.href = url;
          else win?.close();
        })
        .catch(() => win?.close());
      return;
    }
    router.push({
      pathname: "/pageViewer",
      params: { pageId: page.page_id, title: page.title },
    });
  };

  const toggleProfileFilter = (profileId: string | null) => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedProfileId(profileId);
  };

  const content = (
    <ThemedView testID="study-materials-screen" style={styles.container}>
      {!isTeenDelegated && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          testID="study-materials-profile-chips"
        >
          <Pressable
            testID="study-materials-chip-all"
            accessibilityLabel="Show all profiles"
            accessibilityState={{ selected: selectedProfileId === null }}
            onPress={() => toggleProfileFilter(null)}
            style={[
              styles.chip,
              { borderColor },
              selectedProfileId === null && {
                backgroundColor: accentColor,
                borderColor: accentColor,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.chipText,
                selectedProfileId === null && styles.chipTextSelected,
              ]}
            >
              All
            </ThemedText>
          </Pressable>
          {profiles.map((profile) => {
            const isSelected = selectedProfileId === profile.profile_id;
            return (
              <Pressable
                key={profile.profile_id}
                testID={`study-materials-chip-${profile.profile_id}`}
                accessibilityLabel={`Filter by ${profile.name}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => toggleProfileFilter(profile.profile_id)}
                style={[
                  styles.chip,
                  { borderColor },
                  isSelected && {
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}
                >
                  {profile.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {loading ? (
        <ActivityIndicator
          testID="study-materials-loading"
          style={styles.activityIndicator}
        />
      ) : (
        <FlatList
          testID="study-materials-list"
          style={styles.list}
          data={pages}
          keyExtractor={(item) => item.page_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`study-material-row-${item.page_id}`}
              style={[
                styles.itemContainer,
                { backgroundColor: cardBackground, borderColor },
              ]}
              onPress={() => handlePagePress(item)}
            >
              <IconSymbol
                name="book.fill"
                size={28}
                color={accentColor}
                style={styles.pageIcon}
              />
              <View style={styles.itemContent}>
                <ThemedText style={styles.pageTitle} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                {!isTeenDelegated && item.profile_name ? (
                  <ThemedText
                    style={[styles.profileName, { color: iconColor }]}
                    numberOfLines={1}
                  >
                    {item.profile_name}
                  </ThemedText>
                ) : null}
                {item.updated_at || item.created_at ? (
                  <ThemedText
                    style={[styles.lastStudied, { color: iconColor }]}
                    numberOfLines={1}
                  >
                    Updated{" "}
                    {formatDistanceToNowStrict(
                      new Date((item.updated_at || item.created_at) as string)
                    )}{" "}
                    ago
                  </ThemedText>
                ) : null}
              </View>
              <IconSymbol name="chevron.right" size={18} color={iconColor} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View testID="study-materials-empty" style={styles.emptyContainer}>
              <IconSymbol name="book.fill" size={48} color={iconColor} />
              <ThemedText style={styles.emptyText}>
                No study materials yet
              </ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Pages your bots build during chats will appear here
              </ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );

  if (!sessionResolved) {
    return (
      <ThemedView testID="study-materials-screen" style={styles.container}>
        <ActivityIndicator
          testID="study-materials-loading"
          style={styles.activityIndicator}
        />
      </ThemedView>
    );
  }

  if (isTeenDelegated) {
    return content;
  }

  if (hasPin === null) {
    return (
      <ThemedView testID="study-materials-screen" style={styles.container}>
        <ActivityIndicator
          testID="study-materials-loading"
          style={styles.activityIndicator}
        />
      </ThemedView>
    );
  }

  if (!hasPin) {
    return content;
  }

  return <PinWrapper>{content}</PinWrapper>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipsRow: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    minHeight: 32,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
  },
  chipTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  list: {
    flex: 1,
    marginHorizontal: 10,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  pageIcon: {
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    marginRight: 8,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  profileName: {
    fontSize: 14,
    marginTop: 4,
  },
  lastStudied: {
    fontSize: 12,
    marginTop: 4,
  },
  activityIndicator: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#888",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    textAlign: "center",
  },
});
