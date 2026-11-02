// Per-user bot-list cache (single-isolate memory). Entries live until a bot
// write invalidates them or the size cap evicts the oldest. If traffic ever
// spreads across isolates, re-add a TTL: a write on one isolate can't clear
// another's entries.
import type { BotRow } from "./types";

export interface BotListEntry {
  total: number;
  rows: BotRow[];
  models: Map<number, string | null>;
}

const MAX_ENTRIES = 1000;
const entries = new Map<string, BotListEntry>();

// Epoch guards the read/write race: a GET that started reading before a bot
// write must not store its pre-write rows after that write invalidated them.
let epoch = 0;

export function botListEpoch(): number {
  return epoch;
}

export function getBotList(key: string): BotListEntry | null {
  return entries.get(key) ?? null;
}

export function setBotList(key: string, entry: BotListEntry, seenEpoch: number): void {
  if (seenEpoch !== epoch) return; // a write landed mid-read; drop stale rows
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

export function invalidateBotListCache(userId: number): void {
  epoch++;
  const prefix = `${userId}:`;
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

// Full reset for tests, which seed a fresh DB per case (module state
// outlives the DB in the same worker).
export function clearBotListCache(): void {
  entries.clear();
}
