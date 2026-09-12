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
 * HTTP header and does not travel with the file, so the inner document
 * carries an equivalent meta policy (resource loads, fetch/beacon).
 * Top-level navigation/exfiltration is contained by the sandbox wrapper.
 */
export const DOWNLOAD_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:; " +
  "connect-src 'none'; frame-src 'none'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'";

/** Escape a full document for embedding in a double-quoted srcdoc attribute. */
export function escapeSrcdoc(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Build the downloaded file: a minimal wrapper that frames the page in
 * `<iframe sandbox="allow-scripts">`. The sandbox (opaque origin, no
 * top-navigation, no forms, no same-origin access) is enforced by the
 * browser regardless of file:// vs https://, unlike header CSP.
 * Parsed with DOMParser so a `<head>` string inside page JS/comments can
 * never misplace the inner meta policy (no regex over raw source).
 */
export function withDownloadSandbox(html: string, title: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", DOWNLOAD_CSP);
  const head = doc.head ?? doc.documentElement;
  head.insertBefore(meta, head.firstChild);
  const inner = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  const safeTitle = (title || "page").replace(/[<>&]/g, "");
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    `<title>${safeTitle}</title></head>` +
    '<body style="margin:0">' +
    `<iframe sandbox="allow-scripts" title="${safeTitle}" ` +
    'style="border:0;width:100vw;height:100vh" ' +
    `srcdoc="${escapeSrcdoc(inner)}"></iframe></body></html>`
  );
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
  const html = withDownloadSandbox(await response.text(), title);
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
