// Server-owned safety layer — TypeScript port of back/bots/services/safety.py.
// Same policy, same denylists, same refusal copy, same fail-closed guardrail.

import { first, run } from "./db";
import { newUuid } from "./crypto";
import { nowIso } from "./types";
import type { BotRow } from "./types";

export interface SafetyPolicy {
  restrict_language: boolean;
  restrict_adult_topics: boolean;
  enable_web_search: boolean;
  global_floor: boolean;
}

export function policyForBot(bot: BotRow | null): SafetyPolicy {
  if (!bot) return { restrict_language: true, restrict_adult_topics: true, enable_web_search: false, global_floor: true };
  return {
    restrict_language: bot.restrict_language === 1,
    restrict_adult_topics: bot.restrict_adult_topics === 1,
    enable_web_search: bot.enable_web_search === 1,
    global_floor: true,
  };
}

export const REASON_ADULT_TOPIC = "adult_topic";
export const REASON_LANGUAGE = "language";
export const REASON_GLOBAL_FLOOR = "global_floor";
export const REASON_WEB_BLOCKED = "web_blocked";

export const STAGE_INPUT = "input";
export const STAGE_OUTPUT = "output";
export const STAGE_WEB_QUERY = "web_query";
export const STAGE_WEB_RESULT = "web_result";
export const STAGE_TOOL_FLASHCARD = "tool_flashcard";
export const STAGE_TOOL_HTML_PAGE = "tool_html_page";

const GLOBAL_FLOOR_TERMS = [
  "suicide", "suicidal", "kill myself", "end my life", "hurt myself",
  "cut myself", "self harm", "self-harm", "child porn", "child pornography",
  "child sexual", "child sexual abuse", "child sexual abuse material", "csam",
  "make a bomb", "build a bomb", "bomb making", "pipe bomb",
  "how to kill", "how to murder", "how to stab",
  "kill someone", "murder someone", "stab someone",
];

const ADULT_TOPIC_TERMS = [
  "porn", "pornography", "onlyfans", "nudes", "naked", "sex", "sexting",
  "sexual", "hooker", "prostitute", "escort service", "strip club", "erotic",
  "fetish", "xxx", "vagina", "penis", "boobs", "get drunk", "buy alcohol",
  "buy weed", "buy drugs", "vape", "gambling site", "online casino", "bet money",
];

const LANGUAGE_TERMS = [
  "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "cunt",
  "dickhead", "whore", "slut",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word-ish match so 'Essex' does not trip 'sex'.
function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`).test(text);
}

function findTerms(text: string, terms: string[]): string[] {
  return terms.filter((t) => containsTerm(text, t));
}

export const normalizeText = (text: string): string => (text ?? "").toLowerCase().trim();

export interface SafetyVerdict {
  blocked: boolean;
  reason_code: string | null;
  matched_terms: string[];
}

export const ALLOWED: SafetyVerdict = { blocked: false, reason_code: null, matched_terms: [] };

export function isCrisis(verdict: SafetyVerdict): boolean {
  return (
    verdict.reason_code === REASON_GLOBAL_FLOOR &&
    verdict.matched_terms.some(
      (term) =>
        containsTerm(term, "myself") ||
        containsTerm(term, "my life") ||
        term.includes("suicid") ||
        term.replace(/-/g, " ").includes("self harm"),
    )
  );
}

export const REFUSAL_ADULT_TOPIC =
  "I can't help with that topic. Let's keep our chat school-friendly - " +
  "if something like this is bothering you, please talk with a parent, " +
  "school counselor, or another trusted adult.";
export const REFUSAL_LANGUAGE = "That language isn't okay here. Could you rephrase that in a kinder way?";
export const REFUSAL_CRISIS =
  "That sounds really hard, and I'm glad you told me. Please talk to a " +
  "parent, school counselor, or another trusted adult you trust about this " +
  "right away - you deserve real support. I'm here to help with schoolwork " +
  "whenever you're ready.";
export const REFUSAL_GLOBAL_FLOOR =
  "I can't help with that. If something is bothering you, please talk with " +
  "a parent, school counselor, or another trusted adult.";

export function refusalForVerdict(verdict: SafetyVerdict): string {
  if (isCrisis(verdict)) return REFUSAL_CRISIS;
  if (verdict.reason_code === REASON_ADULT_TOPIC) return REFUSAL_ADULT_TOPIC;
  if (verdict.reason_code === REASON_LANGUAGE) return REFUSAL_LANGUAGE;
  return REFUSAL_GLOBAL_FLOOR;
}

const GUARDRAIL_FLOOR_CATEGORIES: Record<string, string[]> = {
  "sexual/minors": ["sexual/minors"],
  "self-harm": ["self-harm"],
  "self-harm/intent": ["self-harm"],
  "self-harm/instructions": ["self-harm"],
  violence: ["violence"],
  "violence/graphic": ["violence/graphic"],
  "violence/instructions": ["violence/instructions"],
  "illicit/violent": ["illicit/violent"],
};

const GUARDRAIL_POLICY_CATEGORIES: Record<string, string> = {
  sexual: REASON_ADULT_TOPIC,
  illicit: REASON_ADULT_TOPIC,
  harassment: REASON_LANGUAGE,
  "harassment/threatening": REASON_LANGUAGE,
  hate: REASON_LANGUAGE,
  "hate/threatening": REASON_LANGUAGE,
};

export function verdictFromModeration(result: Record<string, unknown>, policy: SafetyPolicy): SafetyVerdict | null {
  const cats = result["categories"];
  const categories = cats && typeof cats === "object"
    ? Object.entries(cats as Record<string, unknown>).filter(([, hit]) => hit === true).map(([c]) => c)
    : [];
  for (const category of categories) {
    if (category in GUARDRAIL_FLOOR_CATEGORIES) {
      return { blocked: true, reason_code: REASON_GLOBAL_FLOOR, matched_terms: GUARDRAIL_FLOOR_CATEGORIES[category]! };
    }
  }
  const unknown = categories.filter((c) => !(c in GUARDRAIL_POLICY_CATEGORIES));
  if (unknown.length > 0) {
    return { blocked: true, reason_code: REASON_GLOBAL_FLOOR, matched_terms: [unknown[0]!] };
  }
  if (policy.restrict_adult_topics) {
    for (const category of categories) {
      if (GUARDRAIL_POLICY_CATEGORIES[category] === REASON_ADULT_TOPIC) {
        return { blocked: true, reason_code: REASON_ADULT_TOPIC, matched_terms: [category] };
      }
    }
  }
  if (policy.restrict_language) {
    for (const category of categories) {
      if (GUARDRAIL_POLICY_CATEGORIES[category] === REASON_LANGUAGE) {
        return { blocked: true, reason_code: REASON_LANGUAGE, matched_terms: [category] };
      }
    }
  }
  if (categories.length > 0) return null;
  return { blocked: true, reason_code: REASON_GLOBAL_FLOOR, matched_terms: [] };
}

async function guardrailCheck(
  text: string,
  policy: SafetyPolicy,
  apiKey: string,
): Promise<SafetyVerdict | null> {
  if (!apiKey || !text) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`moderation HTTP ${resp.status}`);
    const body = (await resp.json()) as { results?: unknown[] };
    const results = body.results ?? [];
    const f = results[0] as Record<string, unknown> | undefined;
    if (!f || typeof f["flagged"] !== "boolean") throw new Error("unexpected moderation payload");
    if (f["flagged"] === true) return verdictFromModeration(f, policy);
    return null;
  } catch {
    // Fail closed: with a key configured, a failed check blocks.
    return { blocked: true, reason_code: REASON_GLOBAL_FLOOR, matched_terms: [] };
  }
}

export async function evaluateText(
  text: string,
  policy: SafetyPolicy,
  openaiKey: string,
  _source = "INPUT",
): Promise<SafetyVerdict> {
  const normalized = normalizeText(text);
  const floorHits = findTerms(normalized, GLOBAL_FLOOR_TERMS);
  if (floorHits.length > 0) return { blocked: true, reason_code: REASON_GLOBAL_FLOOR, matched_terms: floorHits };
  if (policy.restrict_adult_topics) {
    const adultHits = findTerms(normalized, ADULT_TOPIC_TERMS);
    if (adultHits.length > 0) return { blocked: true, reason_code: REASON_ADULT_TOPIC, matched_terms: adultHits };
  }
  if (policy.restrict_language) {
    const langHits = findTerms(normalized, LANGUAGE_TERMS);
    if (langHits.length > 0) return { blocked: true, reason_code: REASON_LANGUAGE, matched_terms: langHits };
  }
  const verdict = await guardrailCheck(text, policy, openaiKey);
  if (verdict) return verdict;
  return ALLOWED;
}

export const evaluateWebQuery = (q: string, p: SafetyPolicy, k: string) => evaluateText(q, p, k, "INPUT");
export const evaluateWebResult = (t: string, p: SafetyPolicy, k: string) => evaluateText(t, p, k, "OUTPUT");

export function redactSnippet(snippet: string, verdict: SafetyVerdict | null = null, limit = 200): string {
  let redacted = normalizeText(snippet);
  if (verdict) {
    let replaced = false;
    for (const term of verdict.matched_terms) {
      const re = new RegExp(`(?<!\\w)${escapeRegExp(term)}(?!\\w)`, "g");
      const next = redacted.replace(re, "[redacted]");
      if (next !== redacted) replaced = true;
      redacted = next;
    }
    if (!replaced) redacted = "[redacted]";
  }
  return redacted.slice(0, limit);
}

export interface SafetyEventContext {
  userId: number | null;
  profileId: number | null;
  chatId: number | null;
  botId: number | null;
  messageId: number | null;
}

// Best-effort audit log; feeds the parent inbox. Never raises.
export async function recordSafetyEvent(
  db: D1Database,
  stage: string,
  verdict: SafetyVerdict,
  ctx: SafetyEventContext,
  snippet: string,
): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO bots_safetyevent (event_id, user_id, profile_id, chat_id, bot_id, message_id, stage, reason_code, snippet_redacted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newUuid(),
      ctx.userId,
      ctx.profileId,
      ctx.chatId,
      ctx.botId,
      ctx.messageId,
      stage,
      verdict.reason_code ?? "",
      redactSnippet(snippet, verdict),
      nowIso(),
    );
  } catch {
    // best-effort
  }
}

export async function getUserIdForChat(db: D1Database, chatId: number): Promise<number | null> {
  const row = await first<{ user_id: number | null }>(db, "SELECT user_id FROM bots_chat WHERE id = ?", chatId);
  return row?.user_id ?? null;
}
