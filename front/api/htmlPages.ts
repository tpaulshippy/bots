import { request } from "./request";
import { getTokens } from "./tokens";

export interface HtmlPage {
  id: number;
  page_id: string;
  title: string;
  html: string;
  raw_url: string;
}

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/** Short-lived signed raw URL for window.open(), which cannot send the JWT. */
export async function getPageLink(pageId: string): Promise<string | null> {
  const data = await request<{ url: string } | null>(
    `/html-pages/${pageId}/link/`,
    {},
    null,
  );
  if (!data?.url) return null;
  if (data.url.startsWith("/")) return `${BASE_URL}${data.url}`;
  return data.url;
}

export const fetchHtmlPage = async (pageId: string): Promise<HtmlPage | null> =>
  request<HtmlPage | null>(`/html-pages/${pageId}.json`, {}, null);

/**
 * Resource restrictions mirrored into downloads. The raw view's CSP is an
 * HTTP header and does not travel with the file; `sandbox` is forbidden in
 * <meta> policies, but the remaining directives still block network/beacon
 * exfiltration from agent-generated inline JS in the saved file.
 */
export const DOWNLOAD_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:; " +
  "connect-src 'none'; frame-src 'none'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'";

export function withDownloadCsp(html: string): string {
  const meta =
    `<meta http-equiv="Content-Security-Policy" content="${DOWNLOAD_CSP}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${meta}`);
  }
  return meta + html;
}

/** Web-only download via the signed URL (no auth header needed). */
export async function downloadHtmlPage(pageId: string, title: string): Promise<void> {
  const url = await getPageLink(pageId);
  if (!url) throw new Error("Could not get page link");
  const headers: Record<string, string> = {};
  // Same-origin fallback: attach the JWT when the signed handoff fails.
  const tokens = await getTokens().catch(() => null);
  if (tokens?.access) headers["Authorization"] = `Bearer ${tokens.access}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
  const html = withDownloadCsp(await response.text());
  const blob = new Blob([html], { type: "text/html" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${title || "page"}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
