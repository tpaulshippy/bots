// First-run onboarding bootstrap — port of back/bots/services/onboarding.py.

import { first } from "./db";
import { newUuid } from "./crypto";
import { nowIso } from "./types";
import { hashPin, validatePin } from "./pin";

export const DEFAULT_TEMPLATE_NAME = "Blank";
export const DEFAULT_BOT_COLOR = "#2A9D8F";
export const DEFAULT_BOT_ICON = "sparkles";

export interface BootstrapInput {
  profileName?: unknown;
  botName?: unknown;
  templateName?: unknown;
  pin?: unknown;
  systemPrompt?: unknown;
  color?: unknown;
  icon?: unknown;
  studentEmail?: unknown;
  profileId?: unknown;
  botId?: unknown;
}

export interface FieldErrors {
  [field: string]: string;
}

function cleanPin(pin: unknown): string | null | { error: string } {
  if (pin === null || pin === undefined || pin === "") return null;
  const cleaned = String(pin).trim();
  if (cleaned === "") return null;
  if (!validatePin(cleaned)) return { error: "PIN must be a string of 4 to 8 digits." };
  return cleaned;
}

function cleanProfileName(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined) return null;
  const cleaned = String(v).trim();
  if (cleaned === "") return { error: "Profile name must not be blank." };
  return cleaned;
}

function cleanEmail(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const normalized = s.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { error: "Enter a valid email address." };
  return normalized;
}

function cleanUuid(v: unknown): string | null | { error: string } {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return { error: "Invalid id." };
  return s;
}

export async function bootstrapOnboarding(
  db: D1Database,
  userId: number,
  input: BootstrapInput,
): Promise<{ profile_id: string; bot_id: string } | { errors: FieldErrors }> {
  const pinValue = cleanPin(input.pin);
  if (pinValue !== null && typeof pinValue === "object") return { errors: { pin: pinValue.error } };
  const cleanedName = cleanProfileName(input.profileName);
  if (cleanedName !== null && typeof cleanedName === "object") return { errors: { profileName: cleanedName.error } };
  const cleanedEmail = cleanEmail(input.studentEmail);
  if (cleanedEmail !== null && typeof cleanedEmail === "object") return { errors: { studentEmail: cleanedEmail.error } };
  const cleanedProfileId = cleanUuid(input.profileId);
  if (cleanedProfileId !== null && typeof cleanedProfileId === "object") return { errors: { profileId: cleanedProfileId.error } };
  const cleanedBotId = cleanUuid(input.botId);
  if (cleanedBotId !== null && typeof cleanedBotId === "object") return { errors: { botId: cleanedBotId.error } };

  const stmts: D1PreparedStatement[] = [];
  const now = nowIso();

  // Resolve profile.
  let profileUuid: string | null = null; // set when THIS request inserts
  let profile = cleanedProfileId
    ? await first<{ id: number; profile_id: string }>(
        db,
        "SELECT id, profile_id FROM bots_profile WHERE user_id = ? AND profile_id = ? AND deleted_at IS NULL",
        userId,
        cleanedProfileId,
      )
    : await first<{ id: number; profile_id: string }>(
        db,
        "SELECT id, profile_id FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
        userId,
      );

  if (!profile) {
    if (!cleanedName || typeof cleanedName !== "string") return { errors: { profileName: "Profile name must not be blank." } };
    const newProfileId = newUuid();
    const emailVal = cleanedEmail && typeof cleanedEmail === "string" ? cleanedEmail : null;
    if (cleanedProfileId) {
      // Stale review id: recreate exactly (a concurrent retry could
      // duplicate here; single-tap wizard flows never hit this path).
      stmts.push(
        db.prepare("INSERT INTO bots_profile (user_id, profile_id, name, oauth_email, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
          userId,
          newProfileId,
          cleanedName,
          emailVal,
          now,
          now,
        ),
      );
    } else {
      // First-run: converge concurrent retries on one row — the insert only
      // fires when no active profile exists at batch time (batches are
      // atomic, so a racing winner is visible to the loser).
      stmts.push(
        db.prepare(
          `INSERT INTO bots_profile (user_id, profile_id, name, oauth_email, created_at, modified_at)
           SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL)`,
        ).bind(userId, newProfileId, cleanedName, emailVal, now, now, userId),
      );
    }
    profileUuid = newProfileId;
    profile = { id: 0, profile_id: newProfileId };
  } else if (cleanedName || typeof input.studentEmail === "string") {
    const sets: string[] = ["modified_at = ?"];
    const params: unknown[] = [now];
    if (cleanedName && typeof cleanedName === "string") {
      sets.push("name = ?");
      params.push(cleanedName);
    }
    // Only an explicit string rebinds/unbinds (Django parity: None/null
    // means "not supplied", "" unbinds).
    if (typeof input.studentEmail === "string") {
      sets.push("oauth_email = ?");
      params.push(cleanedEmail && typeof cleanedEmail === "string" ? cleanedEmail : null);
    }
    params.push(profile.id);
    stmts.push(db.prepare(`UPDATE bots_profile SET ${sets.join(", ")} WHERE id = ?`).bind(...params));
  }

  // Resolve bot.
  let bot = cleanedBotId
    ? await first<{ id: number; bot_id: string }>(
        db,
        "SELECT id, bot_id FROM bots_bot WHERE user_id = ? AND bot_id = ? AND deleted_at IS NULL",
        userId,
        cleanedBotId,
      )
    : await first<{ id: number; bot_id: string }>(
        db,
        "SELECT id, bot_id FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
        userId,
      );

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  let botUuid: string | null = null; // set when THIS request inserts
  if (!bot) {
    const defModel = await first<{ id: number }>(db, "SELECT id FROM bots_aimodel WHERE is_default = 1");
    const newBotId = newUuid();
    const botValues = [
      userId,
      defModel?.id ?? null,
      newBotId,
      str(input.botName) || "Penelope",
      str(input.systemPrompt) ?? null,
      str(input.templateName) || DEFAULT_TEMPLATE_NAME,
      str(input.color) || DEFAULT_BOT_COLOR,
      str(input.icon) || DEFAULT_BOT_ICON,
      now,
      now,
    ] as const;
    if (cleanedBotId) {
      // Stale review id: recreate exactly (see profile path for the caveat).
      stmts.push(
        db.prepare(
          `INSERT INTO bots_bot (user_id, ai_model_id, bot_id, name, system_prompt, template_name, color, icon, created_at, modified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(...botValues),
      );
    } else {
      // First-run: converge concurrent retries on one row.
      stmts.push(
        db.prepare(
          `INSERT INTO bots_bot (user_id, ai_model_id, bot_id, name, system_prompt, template_name, color, icon, created_at, modified_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL)`,
        ).bind(...botValues, userId),
      );
    }
    botUuid = newBotId;
    bot = { id: 0, bot_id: newBotId };
  } else {
    const sets: string[] = ["modified_at = ?"];
    const params: unknown[] = [now];
    const maybe = (col: string, v: unknown, allowEmpty = false): void => {
      if (typeof v === "string" && (allowEmpty || v)) {
        sets.push(`${col} = ?`);
        params.push(v);
      }
    };
    maybe("name", input.botName);
    maybe("template_name", input.templateName);
    if (input.systemPrompt !== undefined) {
      sets.push("system_prompt = ?");
      params.push(str(input.systemPrompt));
    }
    maybe("color", input.color);
    maybe("icon", input.icon);
    if (sets.length > 1) {
      params.push(bot.id);
      stmts.push(db.prepare(`UPDATE bots_bot SET ${sets.join(", ")} WHERE id = ?`).bind(...params));
    }
  }

  // Account: PIN + onboarding flag. The single db.batch() below is atomic;
  // the conditional inserts above make retries converge instead of
  // duplicating when two bootstraps race.
  const pinHash = pinValue && typeof pinValue === "string" ? await hashPin(pinValue) : null;
  const acct = await first<{ id: number; onboarding_completed_at: string | null }>(
    db,
    "SELECT id, onboarding_completed_at FROM bots_useraccount WHERE user_id = ?",
    userId,
  );
  if (!acct) {
    // OR IGNORE: a concurrent bootstrap may have created the row after our
    // read; the loser's insert is dropped instead of 500ing on UNIQUE.
    stmts.push(
      db.prepare(
        "INSERT OR IGNORE INTO bots_useraccount (user_id, pin_hash, onboarding_completed_at) VALUES (?, ?, ?)",
      ).bind(userId, pinHash, now),
    );
  } else {
    if (pinHash) stmts.push(db.prepare("UPDATE bots_useraccount SET pin_hash = ? WHERE user_id = ?").bind(pinHash, userId));
    if (!acct.onboarding_completed_at) {
      stmts.push(db.prepare("UPDATE bots_useraccount SET onboarding_completed_at = ? WHERE user_id = ?").bind(now, userId));
    }
  }

  try {
    if (stmts.length > 0) await db.batch(stmts);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("UNIQUE") && (msg.includes("oauth_email") || msg.includes("bots_profile"))) {
      return { errors: { studentEmail: "That email is already used by another profile." } };
    }
    throw e;
  }

  // Re-read ids for freshly inserted rows. First-run paths converge on the
  // oldest row (so concurrent retries share one); recreate paths select the
  // exact uuid this request inserted.
  if (profile.id === 0) {
    const row = profileUuid && cleanedProfileId
      ? await first<{ id: number; profile_id: string }>(
          db,
          "SELECT id, profile_id FROM bots_profile WHERE profile_id = ?",
          profileUuid,
        )
      : await first<{ id: number; profile_id: string }>(
          db,
          "SELECT id, profile_id FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
          userId,
        );
    if (row) profile = row;
  }
  if (bot.id === 0) {
    const row = botUuid && cleanedBotId
      ? await first<{ id: number; bot_id: string }>(
          db,
          "SELECT id, bot_id FROM bots_bot WHERE bot_id = ?",
          botUuid,
        )
      : await first<{ id: number; bot_id: string }>(
          db,
          "SELECT id, bot_id FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
          userId,
        );
    if (row) bot = row;
  }
  return { profile_id: profile.profile_id, bot_id: bot.bot_id };
}
