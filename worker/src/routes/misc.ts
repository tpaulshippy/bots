// Support contact form + media serving + cron handlers.

import { makeRouter } from "./helpers";
import { authenticate } from "../auth";
import { verifyMediaSig } from "../images";
import { pushToTokens } from "../push";
import { all, first, run } from "../db";
import { nowIso, type Env } from "../types";

// POST /api/support/ — {name,email,subject,message}. Django sent SMTP mail;
// the Worker uses Resend when configured, else logs (documented).
export const support = makeRouter();
support.post("/", async (c) => {
  const env = c.env as Env;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.["name"] === "string" ? body["name"] : "";
  const email = typeof body?.["email"] === "string" ? body["email"] : "";
  const subject = typeof body?.["subject"] === "string" ? body["subject"] : "";
  const message = typeof body?.["message"] === "string" ? body["message"] : "";
  if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
    return c.json({ detail: "All fields are required." }, 400);
  }
  if (env.RESEND_API_KEY && env.EMAIL_RECIPIENT) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.EMAIL_RECIPIENT,
          to: [env.EMAIL_RECIPIENT],
          subject: `Syft Support - ${subject}`,
          text: `From: ${name} <${email}>\n\n${message}`,
          reply_to: email,
        }),
      });
    } catch {
      // fall through to success: never leak mailer outages to the form
    }
  } else {
    console.log(`support form: ${name} <${email}> ${subject}`);
  }
  return c.json({ response: "ok" });
});

// GET /api/media/:key?sig= — R2 (or legacy S3) bytes behind an HMAC URL.
export const media = makeRouter();
media.get("/:key", async (c) => {
  const env = c.env as Env;
  const key = decodeURIComponent((c.req.param("key") ?? ""));
  const sig = c.req.query("sig") ?? "";
  if (!sig || !(await verifyMediaSig(env, key, sig))) {
    return c.json({ detail: "Authentication credentials were not provided." }, 401);
  }
  const obj = await env.IMAGES.get(key);
  if (obj) {
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_STORAGE_BUCKET_NAME) {
    const { s3GetObject } = await import("../s3");
    try {
      const legacy = await s3GetObject(env, key);
      return new Response(legacy.bytes, {
        headers: { "Content-Type": legacy.contentType, "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" },
      });
    } catch {
      return c.json({ detail: "Not found." }, 404);
    }
  }
  return c.json({ detail: "Not found." }, 404);
});

// --- crons (port of send_study_reminders / send_activity_digests) ----------

export async function sendStudyReminders(env: Env): Promise<void> {
  // Mirrors send_study_reminders: due cards per deck (NULL due_at excluded,
  // soft-deleted profiles excluded), opted-in devices only, counts-only
  // copy (a sibling's deck names must never reach a parent device), single
  // deck deep-links into the study session.
  const now = new Date().toISOString();
  const rows = await all<{
    deck_id: string;
    name: string;
    user_id: number;
    profile_id: string;
    due: number;
  }>(
    env.DB,
    `SELECT d.deck_id AS deck_id, d.name AS name, pr.user_id AS user_id, pr.profile_id AS profile_id, COUNT(*) AS due
     FROM bots_flashcard f
     JOIN bots_deck d ON d.id = f.deck_id
     JOIN bots_profile pr ON pr.id = d.profile_id
     WHERE f.due_at <= ? AND f.due_at IS NOT NULL AND pr.deleted_at IS NULL
     GROUP BY d.deck_id, d.name, pr.user_id, pr.profile_id
     ORDER BY d.name ASC`,
    now,
  );
  const byUser = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = byUser.get(row.user_id) ?? [];
    bucket.push(row);
    byUser.set(row.user_id, bucket);
  }
  for (const [userId, decks] of byUser) {
    const devices = await all<{ notification_token: string; notify_digest_only: number }>(
      env.DB,
      "SELECT notification_token, notify_digest_only FROM bots_device WHERE user_id = ? AND notify_study_due = 1 AND deleted_at IS NULL",
      userId,
    );
    // notify_study_reminder skips digest-only devices so the digest stays
    // their single push source.
    const targets = devices.filter((d) => d.notify_digest_only !== 1);
    if (targets.length === 0) continue;
    const total = decks.reduce((a, d) => a + d.due, 0);
    const profileIds = new Set(decks.map((d) => d.profile_id));
    let body: string;
    const data: Record<string, unknown> = { target: "study_due" };
    if (profileIds.size === 1 && decks[0]!.profile_id) data["profile_id"] = decks[0]!.profile_id;
    if (decks.length === 1) {
      const only = decks[0]!;
      const count = only.due;
      body = `${count} card${count === 1 ? "" : "s"} due \u2014 time to review!`;
      data["deck_id"] = only.deck_id;
    } else {
      body = `${total} cards due across ${decks.length} decks \u2014 time to review!`;
    }
    await pushToTokens(
      targets.map((d) => d.notification_token),
      "Study reminder",
      body,
      data,
    );
  }
}

export async function sendActivityDigests(env: Env, hours = 24): Promise<void> {
  // Mirrors send_activity_digests: digest-only devices, active profiles
  // only ('Maya: 3 chats'), users with no activity in the window are
  // skipped so digests never become spam.
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const deviceRows = await all<{ user_id: number; notification_token: string }>(
    env.DB,
    "SELECT DISTINCT user_id, notification_token FROM bots_device WHERE notify_digest_only = 1 AND deleted_at IS NULL",
    // NOTE: DISTINCT over (user_id, token) keeps one row per device.
  );
  const byUser = new Map<number, string[]>();
  for (const row of deviceRows) {
    const bucket = byUser.get(row.user_id) ?? [];
    bucket.push(row.notification_token);
    byUser.set(row.user_id, bucket);
  }
  for (const [userId, tokens] of byUser) {
    const profiles = await all<{ id: number; name: string | null }>(
      env.DB,
      "SELECT id, name FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
      userId,
    );
    const lines: string[] = [];
    for (const profile of profiles) {
      const row = await first<{ n: number }>(
        env.DB,
        "SELECT COUNT(*) AS n FROM bots_chat WHERE user_id = ? AND profile_id = ? AND modified_at >= ?",
        userId,
        profile.id,
        since,
      );
      const n = row?.n ?? 0;
      if (n > 0) lines.push(`${profile.name || "Kid"}: ${n} chat${n === 1 ? "" : "s"}`);
    }
    if (lines.length === 0) continue;
    await pushToTokens(tokens, "Syft daily summary", lines.join(" · "), { target: "parent_activity" });
  }
}

export async function updateLastLogin(env: Env, userId: number): Promise<void> {
  await run(env.DB, "UPDATE auth_user SET last_login = ? WHERE id = ?", nowIso(), userId).catch(() => undefined);
}


