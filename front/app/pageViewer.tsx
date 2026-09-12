import React, { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { getPageLink } from "@/api/htmlPages";

/**
 * In-app viewer for agent-built HTML pages (mobile + web fallback).
 *
 * Loads the signed raw URL, so the page renders under the raw view's
 * CSP headers (sandbox, no network) exactly like a browser tab. The JWT
 * never enters the page context: link minting uses the authenticated
 * apiClient, and the WebView runs with DOM storage disabled.
 */
export default function PageViewer() {
  const { pageId, title } = useLocalSearchParams<{ pageId: string; title?: string }>();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(!pageId);
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "Page" });
  }, [navigation, title]);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    getPageLink(pageId)
      .then((link) => {
        if (cancelled) return;
        if (link) setUrl(link);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (failed) {
    return (
      <ThemedView testID="page-viewer-error" style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Could not open this page. Please try again.</ThemedText>
      </ThemedView>
    );
  }

  if (!url) {
    return (
      <ThemedView testID="page-viewer-loading" style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <WebView
      testID="page-viewer-webview"
      source={{ uri: url }}
      domStorageEnabled={false}
      startInLoadingState
      renderLoading={() => <ActivityIndicator style={{ flex: 1 }} />}
    />
  );
}
