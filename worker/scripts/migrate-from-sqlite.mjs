// Migrates rows from the Django SQLite database (back/db.sqlite3) into D1.
//
// Usage:
//   node scripts/migrate-from-sqlite.mjs [path/to/db.sqlite3] > /tmp/seed.sql
//   wrangler d1 execute syft-db --local --file=/tmp/seed.sql     # verify locally
//   wrangler d1 execute syft-db --remote --file=/tmp/seed.sql    # cutover
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

const SRC = process.argv[2] ?? new URL("../../back/db.sqlite3", import.meta.url).pathname;
if (!existsSync(SRC)) {
  console.error(`SQLite database not found: ${SRC}`);
  process.exit(1);
}

const TABLES = [
  "auth_user",
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
  "bots_useraccount",
  "bots_usagelimithit",
  "bots_revenuecatwebhookevent",
];

const DATETIME_COLS = new Set([
  "last_login", "date_joined", "created_at", "modified_at", "updated_at",
  "deleted_at", "due_at", "last_reviewed_at", "reviewed_at",
  "pin_locked_until", "onboarding_completed_at", "usage_reset_at",
]);

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
  } catch {
    console.error(`-- skipping missing table ${table}`);
    continue;
  }
  if (cols.length === 0) {
    console.error(`-- skipping missing table ${table}`);
    continue;
  }
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  console.error(`-- ${table}: ${rows.length} rows`);
  const quoted = cols.map((c) => `"${c}"`).join(", ");
  for (const row of rows) {
    const vals = cols.map((c) => {
      let v = row[c];
      // node:sqlite returns INTEGER 0/1 and TEXT as-is; normalize datetimes.
      if (DATETIME_COLS.has(c)) v = normalizeDateTime(v);
      // Booleans/clocks stored as 0/1 stay numeric.
      return esc(v);
    });
    out.push(`INSERT INTO ${table} (${quoted}) VALUES (${vals.join(", ")});`);
  }
}

process.stdout.write(out.join("\n") + "\n");
