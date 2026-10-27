// Single-file HTML validation — port of
// back/bots/serializers/html_page_serializer.py.

export const MAX_HTML_BYTES = 200_000;

const EXTERNAL_URL_RE =
  /\b(?:src|href|srcset|action|formaction|cite|data|poster|codebase)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function isRemoteUrl(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v || v.startsWith("#")) return false;
  if (v.startsWith("http:") || v.startsWith("https:") || v.startsWith("//") || v.startsWith("javascript:") || v.startsWith("vbscript:")) {
    return true;
  }
  if (v.startsWith("data:")) {
    return !(v.startsWith("data:image/") || v.startsWith("data:audio/") || v.startsWith("data:video/") || v.startsWith("data:font/"));
  }
  if (v.includes(",")) {
    return v.split(",").some((part) => {
      const first = part.trim().split(/\s+/)[0] ?? "";
      return first ? isRemoteUrl(first) : false;
    });
  }
  return false;
}

export function hasExternalResource(html: string): boolean {
  EXTERNAL_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  for (;;) {
    m = EXTERNAL_URL_RE.exec(html ?? "");
    if (!m) return false;
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (isRemoteUrl(value)) return true;
  }
}

export function htmlToText(html: string): string {
  const stripped = (html ?? "").replace(/<[^>]+>/g, " ");
  // Decode common entities without a DOM.
  const decoded = stripped
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  return decoded.replace(/\s+/g, " ").trim();
}

export function isSingleFileHtml(html: string): boolean {
  const lowered = (html ?? "").toLowerCase();
  if (!lowered.includes("<html") && !lowered.includes("<!doctype html") && !lowered.includes("<body")) return false;
  if (!lowered.includes("</html") && !lowered.includes("</body")) return false;
  return !hasExternalResource(html ?? "");
}

export function validateTitle(value: unknown): string | null {
  const v = (typeof value === "string" ? value : "").trim();
  if (!v) return null;
  return v.slice(0, 255);
}

export function validateHtmlDoc(value: unknown): { ok: true; html: string } | { ok: false; detail: string } {
  if (typeof value !== "string" || !value.trim()) return { ok: false, detail: "HTML is required." };
  if (new TextEncoder().encode(value).length > MAX_HTML_BYTES) return { ok: false, detail: "HTML exceeds 200KB limit." };
  if (!isSingleFileHtml(value)) return { ok: false, detail: "HTML must be a single self-contained page." };
  return { ok: true, html: value };
}
