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
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    // Decode character-encoded schemes first (`&#106;avascript:` renders as
    // `javascript:` in the browser), and also test with entities stripped
    // (`&NewLine;javascript:` uses a valid HTML5 ref outside our table).
    // Either hit means remote — this gate errs toward blocking.
    const decoded = decodeEntities(raw);
    const stripped = raw.replace(/&[#a-zA-Z0-9]+;?/g, "");
    if (isRemoteUrl(decoded) || isRemoteUrl(stripped)) return true;
  }
}

export function htmlToText(html: string): string {
  // Strip tags then decode entities so safety checks see rendered words:
  // `p&#111;rn` must read as `porn` before the denylist runs.
  //
  // Single left-to-right pass (no re-scanning, so `&amp;lt;` decodes once
  // to `&lt;`, matching browsers/Python): numeric refs with or without a
  // trailing `;` (HTML5 decodes both in text), astral code points via
  // fromCodePoint, and the named refs browsers decode with or without `;`
  // plus common semicolon-terminated ones. Unknown entities pass through.
  const stripped = (html ?? "").replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(stripped);
  return decoded.replace(/\s+/g, " ").trim();
}

// Entity decoder shared by text extraction and URL validation (below).
// See htmlToText for the single-pass rationale.
export function decodeEntities(text: string): string {
  return (text ?? "").replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, ref: string) => {
    if (ref[0] === "#") {
      const hex = ref[1] === "x" || ref[1] === "X";
      const cp = parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return m;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    const lower = ref.toLowerCase();
    const legacy = LEGACY_NAMED[lower];
    if (legacy !== undefined && !m.endsWith(";")) return legacy;
    const named = NAMED_ENTITIES[lower];
    if (named !== undefined && m.endsWith(";")) return named;
    return m;
  });
}

// Named refs the HTML spec decodes even without a trailing semicolon.
const LEGACY_NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
};

// Common semicolon-terminated named refs (superset of what kid-authored
// pages and model output realistically contain). Full HTML5 has 2000+;
// anything outside this table passes through literally, which can only
// make the safety filter see MORE raw text, never less.
const NAMED_ENTITIES: Record<string, string> = {
  ...LEGACY_NAMED,
  nbsp: " ",
  apos: "'",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
};

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
