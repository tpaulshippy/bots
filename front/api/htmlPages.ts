import { request } from "./request";

export interface HtmlPage {
  id: number;
  page_id: string;
  title: string;
  html: string;
  raw_url: string;
}

/** Absolute URL for opening on the local machine's browser (new tab). */
export function htmlPageUrl(pageId: string): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  return `${base}/html-pages/${pageId}/raw/`;
}

export const fetchHtmlPage = async (pageId: string): Promise<HtmlPage | null> =>
  request<HtmlPage | null>(`/html-pages/${pageId}.json`, {}, null);

/** Web-only download: fetch raw HTML (same origin/session) and save locally. */
export async function downloadHtmlPage(pageId: string, title: string): Promise<void> {
  const url = htmlPageUrl(pageId);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
  const html = await response.text();
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
