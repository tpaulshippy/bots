/**
 * Outbound-link safety for assistant messages, shared by the native WebView
 * renderer and the web DOM renderer.
 */
import { Linking } from 'react-native';
import alert from '@/components/Alert';

/**
 * Extract the hostname to show in the outbound-link confirm sheet, e.g.
 * "https://docs.example.com/page" -> "docs.example.com" (and
 * "https://www.example.com/page" -> "example.com"). Falls back to the raw
 * URL when it cannot be parsed.
 */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Assistant links may only be standard web pages. `Linking.openURL` dispatches
 * any registered scheme (tel:, sms:, custom app deep links), so non-HTTP(S)
 * URLs supplied by assistant Markdown are never offered an Open action.
 */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Never open assistant links directly: confirm the destination first.
 * Returns false so callers can cancel the in-WebView navigation.
 */
export function handleAssistantLink(url: string): false {
  if (!isSafeHttpUrl(url)) {
    alert(
      'Blocked link',
      'Only standard web links can be opened here.',
      [{ text: 'OK', style: 'cancel', onPress: () => {} }],
    );
    return false;
  }
  alert(`Open ${linkDomain(url)}?`, url, [
    { text: 'Cancel', style: 'cancel', onPress: () => {} },
    {
      text: 'Open',
      onPress: () => {
        Linking.openURL(url).catch(() => null);
      },
    },
  ]);
  return false;
}
