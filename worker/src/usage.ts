// Token usage + daily quota — port of UserAccount.cost_for_today/over_limit
// (back/bots/models/user_account.py).
//
// Same semantics: today's assistant messages grouped by effective model
// (persisted model_id stamp, else the chat's live bot model, else the default
// model rates), minus an admin-reset baseline that only applies while the
// timezone, cost-computation version, and pricing basis are unchanged.

import { first, run } from "./db";
import { newUuid } from "./crypto";
import { nowIso } from "./types";

export const MAX_COST_DAILY: Record<number, number> = {
  0: 0.01 / 31,
  1: 1.0 / 31,
  2: 5.0 / 31,
};

export const USAGE_RESET_VERSION = 2;

interface AiModelRow {
  model_id: string;
  input_token_cost: number;
  output_token_cost: number;
  is_default: number;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function startOfTodayUtc(timezone: string, now = new Date()): Date {
  // Midnight in the account timezone, returned as UTC. Uses Intl so no
  // timezone DB is bundled (Workers have no pytz). Invalid stored timezones
  // fall back to UTC instead of 500ing every quota-gated request.
  const tz = timezone && isValidTimezone(timezone) ? timezone : "UTC";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "01";
  const asUtcGuess = Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  // Refine: the account-tz offset at that guess.
  const offFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const oparts = offFmt.formatToParts(new Date(asUtcGuess));
  const oget = (t: string): string => oparts.find((p) => p.type === t)?.value ?? "00";
  const asIfUtc = Date.parse(
    `${oget("year")}-${oget("month")}-${oget("day")}T${oget("hour") === "24" ? "00" : oget("hour")}:${oget("minute")}:${oget("second")}Z`,
  );
  const offsetMs = asIfUtc - asUtcGuess;
  return new Date(asUtcGuess - offsetMs);
}

function parseModels(rows: AiModelRow[]) {
  const byId = new Map(rows.map((m) => [m.model_id, m]));
  const def = rows.find((m) => m.is_default === 1) ?? null;
  const price = (modelId: string | null): [number, number] => {
    const m = (modelId && byId.get(modelId)) || def;
    if (!m) return [0, 0];
    return [m.input_token_cost, m.output_token_cost];
  };
  return { byId, def, price };
}

interface BucketRow {
  effective_model: string | null;
  was_stamped: number;
  total_in: number;
  total_out: number;
}

async function messageBucketsToday(
  db: D1Database,
  userId: number,
  startIso: string,
  beforeIso?: string,
): Promise<{ stamped: Map<string, [number, number]>; unstamped: Map<string, [number, number]> }> {
  // Effective model = persisted stamp, else the chat's live bot model
  // (Django: chat__bot__ai_model__model_id), NULL when neither exists.
  const rows = await db
    .prepare(
      `SELECT
         CASE WHEN m.model_id IS NULL OR m.model_id = ''
              THEN am.model_id ELSE m.model_id END AS effective_model,
         CASE WHEN m.model_id IS NULL OR m.model_id = ''
              THEN 0 ELSE 1 END AS was_stamped,
         SUM(m.input_tokens) AS total_in,
         SUM(m.output_tokens) AS total_out
       FROM bots_message m
       JOIN bots_chat c ON c.id = m.chat_id
       LEFT JOIN bots_bot b ON b.id = c.bot_id
       LEFT JOIN bots_aimodel am ON am.id = b.ai_model_id
       WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ?
         ${beforeIso ? "AND m.created_at < ?" : ""}
       GROUP BY effective_model, was_stamped`,
    )
    .bind(...(beforeIso ? [userId, startIso, beforeIso] : [userId, startIso]))
    .all<BucketRow>();
  const stamped = new Map<string, [number, number]>();
  const unstamped = new Map<string, [number, number]>();
  for (const r of rows.results ?? []) {
    const key = r.effective_model ?? "";
    const bucket = r.was_stamped === 1 ? stamped : unstamped;
    const prev = bucket.get(key) ?? [0, 0];
    bucket.set(key, [prev[0] + (r.total_in ?? 0), prev[1] + (r.total_out ?? 0)]);
  }
  return { stamped, unstamped };
}

export interface CostToday {
  total: number;
  inputTokens: number;
  outputTokens: number;
}

export async function rawCostForToday(
  db: D1Database,
  userId: number,
  timezone: string,
  beforeIso?: string,
  now = new Date(),
): Promise<CostToday> {
  const models = await db.prepare("SELECT model_id, input_token_cost, output_token_cost, is_default FROM bots_aimodel").all<AiModelRow>();
  const { price } = parseModels((models.results ?? []) as AiModelRow[]);
  const { stamped, unstamped } = await messageBucketsToday(db, userId, startOfTodayUtc(timezone, now).toISOString(), beforeIso);
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const bucket of [stamped, unstamped]) {
    for (const [modelId, [i, o]] of bucket) {
      const [ri, ro] = price(modelId || null);
      total += i * ri + o * ro;
      inputTokens += i;
      outputTokens += o;
    }
  }
  return { total, inputTokens, outputTokens };
}

interface AccountRow {
  timezone: string;
  usage_reset_version: number;
  usage_reset_pricing: string | null;
  usage_reset_at: string | null;
  usage_reset_timezone: string | null;
  usage_reset_cost: number;
  usage_reset_input_tokens: number;
  usage_reset_output_tokens: number;
}

async function baselinePricingSnapshot(
  db: D1Database,
  userId: number,
  startIso: string,
  cutoffIso: string,
): Promise<{ rates: Record<string, [number, number, number]>; unstamped: Record<string, string | null> }> {
  const stampedRows = await db
    .prepare(
      `SELECT DISTINCT m.model_id AS mid FROM bots_message m JOIN bots_chat c ON c.id = m.chat_id
       WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ?
         AND m.model_id IS NOT NULL AND m.model_id != ''`,
    )
    .bind(userId, startIso, cutoffIso)
    .all<{ mid: string }>();
  const unstampedRows = await db
    .prepare(
      `SELECT DISTINCT c.id AS chat_id, am.model_id AS mid FROM bots_message m
       JOIN bots_chat c ON c.id = m.chat_id
       LEFT JOIN bots_bot b ON b.id = c.bot_id
       LEFT JOIN bots_aimodel am ON am.id = b.ai_model_id
       WHERE c.user_id = ? AND m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ?
         AND (m.model_id IS NULL OR m.model_id = '')`,
    )
    .bind(userId, startIso, cutoffIso)
    .all<{ chat_id: number; mid: string | null }>();
  const models = await db.prepare("SELECT model_id, input_token_cost, output_token_cost, is_default FROM bots_aimodel").all<AiModelRow>();
  const all = Object.fromEntries(
    ((models.results ?? []) as AiModelRow[]).map((m) => [m.model_id, [m.input_token_cost, m.output_token_cost, m.is_default]]),
  ) as Record<string, [number, number, number]>;
  const defaultId = ((models.results ?? []) as AiModelRow[]).find((m) => m.is_default === 1)?.model_id ?? null;
  const stampedIds = new Set(((stampedRows.results ?? []) as { mid: string }[]).map((r) => r.mid));
  const unstamped: Record<string, string | null> = {};
  for (const r of (unstampedRows.results ?? []) as { chat_id: number; mid: string | null }[]) {
    unstamped[String(r.chat_id)] = r.mid;
  }
  const mids = [...stampedIds, ...Object.values(unstamped).filter((m): m is string => m !== null)];
  const fallbackUsed = [...stampedIds, ...Object.values(unstamped)].some((m) => m === null || !(m && m in all));
  const priced = new Set(mids.filter((m) => m !== null));
  if (fallbackUsed && defaultId) priced.add(defaultId);
  const rates: Record<string, [number, number, number]> = {};
  for (const mid of priced) if (mid in all) rates[mid] = all[mid]!;
  return { rates, unstamped };
}

function resetBaselineApplies(acct: AccountRow, startIso: string, livePricing: unknown): boolean {
  if (!acct.usage_reset_at || acct.usage_reset_timezone !== acct.timezone) return false;
  if (acct.usage_reset_version !== USAGE_RESET_VERSION) return false;
  if (acct.usage_reset_at < startIso) return false;
  // Canonical deep-compare: a Django-written baseline (Python json.dumps
  // spacing) and a Worker-written one (compact JSON) describe the same
  // snapshot and must both apply. Raw string comparison would void every
  // cross-implementation reset and recharge already-reset usage.
  try {
    return canonicalJson(livePricing) === canonicalJson(JSON.parse(acct.usage_reset_pricing ?? "{}"));
  } catch {
    return false;
  }
}

// Deterministic serialization: sorted object keys, compact separators.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export async function costForToday(db: D1Database, userId: number, now = new Date()): Promise<CostToday> {
  const acct = await first<AccountRow>(
    db,
    "SELECT timezone, usage_reset_version, usage_reset_pricing, usage_reset_at, usage_reset_timezone, usage_reset_cost, usage_reset_input_tokens, usage_reset_output_tokens FROM bots_useraccount WHERE user_id = ?",
    userId,
  );
  const timezone = acct?.timezone ?? "UTC";
  const startIso = startOfTodayUtc(timezone, now).toISOString();
  const raw = await rawCostForToday(db, userId, timezone, undefined, now);
  if (!acct) return raw;
  const snapshot = await baselinePricingSnapshot(db, userId, startIso, acct.usage_reset_at ?? startIso);
  if (!resetBaselineApplies(acct, startIso, snapshot)) return raw;
  return {
    total: Math.max(0, raw.total - (acct.usage_reset_cost ?? 0)),
    inputTokens: Math.max(0, raw.inputTokens - (acct.usage_reset_input_tokens ?? 0)),
    outputTokens: Math.max(0, raw.outputTokens - (acct.usage_reset_output_tokens ?? 0)),
  };
}

// True when the account hit its daily cap (records a UsageLimitHit, Django parity).
export async function overLimit(db: D1Database, userId: number): Promise<boolean> {
  const acct = await first<{ id: number; subscription_level: number }>(
    db,
    "SELECT id, subscription_level FROM bots_useraccount WHERE user_id = ?",
    userId,
  );
  if (!acct) return false;
  const cost = await costForToday(db, userId);
  if (cost.total >= (MAX_COST_DAILY[acct.subscription_level] ?? MAX_COST_DAILY[0]!)) {
    await run(
      db,
      `INSERT INTO bots_usagelimithit (user_account_id, created_at, modified_at, subscription_level, total_input_tokens, total_output_tokens)
       VALUES (?, ?, ?, ?, ?, ?)`,
      acct.id,
      nowIso(),
      nowIso(),
      acct.subscription_level,
      cost.inputTokens,
      cost.outputTokens,
    );
    return true;
  }
  return false;
}

export async function resetDailyUsage(db: D1Database, userId: number, now = new Date()): Promise<void> {
  const acct = await first<{ timezone: string }>(db, "SELECT timezone FROM bots_useraccount WHERE user_id = ?", userId);
  const timezone = acct?.timezone ?? "UTC";
  const resetAt = now.toISOString();
  const startIso = startOfTodayUtc(timezone, now).toISOString();
  const pricing = await baselinePricingSnapshot(db, userId, startIso, resetAt);
  const raw = await rawCostForToday(db, userId, timezone, resetAt, now);
  await run(
    db,
    `UPDATE bots_useraccount SET usage_reset_at = ?, usage_reset_timezone = ?, usage_reset_cost = ?,
       usage_reset_input_tokens = ?, usage_reset_output_tokens = ?, usage_reset_version = ?, usage_reset_pricing = ?
     WHERE user_id = ?`,
    resetAt,
    timezone,
    raw.total,
    raw.inputTokens,
    raw.outputTokens,
    USAGE_RESET_VERSION,
    JSON.stringify(pricing),
    userId,
  );
}

export { newUuid };
