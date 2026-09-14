import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";
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
  // WKWebView paints white until the document loads. Keep every layer
  // (nav container, React wrapper, WebView, in-document root) on the
  // theme background so dark mode never flashes white while opening.
  const backgroundColor = useThemeColor({}, "background");
  const spinnerColor = useThemeColor({}, "icon");

  const paintBackgroundScript = useMemo(
    () =>
      `document.documentElement.style.background='${backgroundColor}';` +
      `if(document.body){document.body.style.background='${backgroundColor}';}` +
      `true;`,
    [backgroundColor]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: title || "Page",
      contentStyle: { backgroundColor },
    });
  }, [navigation, title, backgroundColor]);

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
    <View testID="page-viewer-webview-wrapper" style={[styles.webviewContainer, { backgroundColor }]}>
      <WebView
        testID="page-viewer-webview"
        source={{ uri: url }}
        domStorageEnabled={false}
        style={[styles.webview, { backgroundColor }]}
        containerStyle={{ backgroundColor }}
        injectedJavaScriptBeforeContentLoaded={paintBackgroundScript}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loadingOverlay, { backgroundColor }]}>
            <ActivityIndicator color={spinnerColor} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
