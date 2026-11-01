// Migrates rows from a Django SQLite database file into D1.
//
// Usage:
//   umask 077
//   node scripts/migrate-from-sqlite.mjs /path/to/db.sqlite3 > /tmp/seed.sql
//   wrangler d1 execute syft-db --local --file=/tmp/seed.sql     # verify locally
//   wrangler d1 execute syft-db --remote --file=/tmp/seed.sql    # cutover
//   rm /tmp/seed.sql
// (back/ was removed from this repo; copy db.sqlite3 from your server or a
// pre-removal checkout before running.)
//
// The dump embeds password/PIN hashes and user emails: generate it on a
// trusted machine with a restrictive umask (above), keep /tmp/seed.sql out
// of shared or backed-up locations, and delete it after the remote import.
//
// Older databases may lack newer tables (e.g. bots_htmlpage); the script
// fails loudly on any missing table unless listed via:
//   node scripts/migrate-from-sqlite.mjs db.sqlite3 --allow-missing=bots_htmlpage,bots_revenuecatwebhookevent
//
// Notes:
//   - Run AFTER `migrations/0001_initial.sql` (schema must exist; ids are
//     preserved so every FK survives the move verbatim).
//   - Datetimes are normalized from Django's naive-UTC
//     "YYYY-MM-DD HH:MM:SS.ffffff" form to ISO-8601 UTC ("...T...ss.sssZ"),
//     which is what the Worker writes for new rows.
//   - allauth/socialaccount tables are intentionally skipped: social login is
//     re-implemented with direct provider verification (oauth_account rows
//     are created on first login after cutover).
//   - S3 media keys are preserved as-is: sync the bucket to R2 separately
//     (README) — the Worker falls back to S3 for unmigrated keys.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { readFileSync, existsSync } = require("node:fs");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--allow-missing="));
const allowMissing = new Set(
  (process.argv.slice(2).find((a) => a.startsWith("--allow-missing=")) ?? "--allow-missing=")
    .split("=")[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const keepLegacyPins = process.argv.includes("--keep-legacy-pins");

// Workers' WebCrypto caps PBKDF2 iterations (~100k measured); Django-era
// hashes above that can never verify on a Worker, and would 500 every
// reauth with no recovery path (clearing a PIN itself requires reauth).
// Unless --keep-legacy-pins is passed, such rows are migrated PIN-less
// (pin_hash = NULL) so those accounts keep working instead of bricking
// parent-gated actions. New-format cheap hashes are copied verbatim.
let nulledPins = 0;
function migratePinHash(v) {
  if (v === null || v === undefined) return null;
  if (keepLegacyPins) return v;
  const m = /^pbkdf2_(?:sha256|sha1)\$(\d+)\$/.exec(String(v));
  if (m && parseInt(m[1], 10) > 100000) {
    nulledPins += 1;
    return null;
  }
  return v;
}
const SRC = args[0];
if (!SRC) {
  console.error("Usage: node scripts/migrate-from-sqlite.mjs /path/to/db.sqlite3 [--allow-missing=t1,t2] > /tmp/seed.sql");
  console.error("(back/ was removed from this repo; copy db.sqlite3 from your server or a pre-removal checkout.)");
  process.exit(1);
}
if (!existsSync(SRC)) {
  console.error(`SQLite database not found: ${SRC}`);
  process.exit(1);
}

// NOTE: bots_useraccount comes right after auth_user (before bots_chat)
// so the chat_count trigger finds the account row when chats are inserted.
// (FK-safe: useraccount only references auth_user.)
const TABLES = [
  "auth_user",
  "bots_useraccount",
  "bots_aimodel",
  "bots_profile",
  "bots_bot",
  "bots_chat",
  "bots_message",
  "bots_device",
  "bots_deck",
  "bots_flashcard",
  "bots_flashcardreview",
  "bots_htmlpage",
  "bots_safetyevent",
  "bots_usagelimithit",
  "bots_revenuecatwebhookevent",
];

const DATETIME_COLS = new Set([
  "last_login", "date_joined", "created_at", "modified_at", "updated_at",
  "deleted_at", "due_at", "last_reviewed_at", "reviewed_at",
  "pin_locked_until", "onboarding_completed_at", "usage_reset_at",
]);

// Django stores UUIDs as undashed hex (char(32)); the Worker API speaks
// canonical dashed form. Normalize migrated rows to dashed lowercase so the
// database is canonical going forward (lookups also match both spellings).
const UUID_COLS = new Set([
  "profile_id", "bot_id", "chat_id", "message_id", "device_id",
  "deck_id", "flashcard_id", "page_id", "event_id",
]);

function normalizeUuid(v) {
  const s = String(v);
  if (/^[0-9a-fA-F]{32}$/.test(s)) {
    const l = s.toLowerCase();
    return `${l.slice(0, 8)}-${l.slice(8, 12)}-${l.slice(12, 16)}-${l.slice(16, 20)}-${l.slice(20)}`;
  }
  return /^[0-9a-fA-F-]{36}$/.test(s) ? s.toLowerCase() : v;
}

function normalizeDateTime(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Django naive-UTC "YYYY-MM-DD HH:MM:SS.ffffff" (+ optional +00:00).
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:\s*(?:\+00:00|Z))?$/.exec(s);
  if (m) {
    const ms = `${m[3] ?? "000"}000`.slice(0, 3);
    return `${m[1]}T${m[2]}.${ms}Z`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

function esc(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

const db = new DatabaseSync(SRC, { readOnly: true });
const out = [];
out.push("-- Seed generated from " + SRC);
out.push("-- Apply AFTER migrations/0001_initial.sql on an empty database.");

for (const table of TABLES) {
  let cols;
  try {
    cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch (e) {
    // A genuine PRAGMA failure (corrupt DB, I/O) is not a skip: rethrow.
    throw new Error(`PRAGMA table_info(${table}) failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (cols.length === 0) {
    if (allowMissing.has(table)) {
      console.error(`-- skipping allowed-missing table ${table}`);
      continue;
    }
    console.error(`FATAL: expected table ${table} is missing from ${SRC}.`);
    console.error(`If this is an older database, re-run with --allow-missing=${table} (and verify the feature works without it).`);
    process.exit(1);
  }
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  console.error(`-- ${table}: ${rows.length} rows`);
  const quoted = cols.map((c) => `"${c}"`).join(", ");
  for (const row of rows) {
    const vals = cols.map((c) => {
      let v = row[c];
      // node:sqlite returns INTEGER 0/1 and TEXT as-is; normalize datetimes.
      if (DATETIME_COLS.has(c)) v = normalizeDateTime(v);
      if (UUID_COLS.has(c) && v !== null && v !== undefined) v = normalizeUuid(v);
      // Unverifiable-on-Workers PIN hashes become NULL (see above).
      if (table === "bots_useraccount" && c === "pin_hash") v = migratePinHash(v);
      // Booleans/clocks stored as 0/1 stay numeric.
      return esc(v);
    });
    out.push(`INSERT INTO ${table} (${quoted}) VALUES (${vals.join(", ")});`);
  }
}

if (nulledPins > 0) {
  console.error(`-- NOTE: nulled ${nulledPins} legacy pin_hash value(s) that Workers cannot verify (see above). Those accounts migrate PIN-less; re-run with --keep-legacy-pins to preserve them (their reauth will 500).`);
}

// Belt and braces: recompute denormalized counts after all rows land, so the
// dump is correct even if trigger ordering changes or rows were inserted
// while an account row was missing.
// Missing account rows (e.g. OAuth users provisioned before the account-row
// fix): chats may reference users with no bots_useraccount row, in which case
// the trigger couldn't count them. Create the rows, then recompute.
out.push("INSERT INTO bots_useraccount (user_id, chat_count) SELECT DISTINCT user_id, 0 FROM bots_chat WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bots_useraccount WHERE bots_useraccount.user_id = bots_chat.user_id);");
out.push("UPDATE bots_useraccount SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.user_id = bots_useraccount.user_id);");
out.push("UPDATE bots_profile SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.profile_id = bots_profile.id);");
out.push("UPDATE bots_chat SET message_count = (SELECT COUNT(*) FROM bots_message WHERE bots_message.chat_id = bots_chat.id);");
process.stdout.write(out.join("\n") + "\n");
