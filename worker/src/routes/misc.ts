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
      },
    });
  }
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_STORAGE_BUCKET_NAME) {
    const { s3GetObject } = await import("../s3");
    try {
      const legacy = await s3GetObject(env, key);
      return new Response(legacy.bytes, {
        headers: { "Content-Type": legacy.contentType, "Cache-Control": "public, max-age=604800" },
      });
    } catch {
      return c.json({ detail: "Not found." }, 404);
    }
  }
  return c.json({ detail: "Not found." }, 404);
});

// --- crons (port of send_study_reminders / send_activity_digests) ----------

export async function sendStudyReminders(env: Env): Promise<void> {
  const now = new Date().toISOString();
  // Per-user aggregation with digest/device preferences honored.
  const rows = await all<{ user_id: number; profile_id: string; deck_id: string; name: string; n: number }>(
    env.DB,
    `SELECT pr.user_id AS user_id, pr.profile_id AS profile_id, d.deck_id AS deck_id, d.name AS name, COUNT(*) AS n
     FROM bots_flashcard f
     JOIN bots_deck d ON d.id = f.deck_id
     JOIN bots_profile pr ON pr.id = d.profile_id
     WHERE f.due_at <= ? AND pr.deleted_at IS NULL
     GROUP BY pr.user_id, pr.profile_id, d.deck_id, d.name`,
    now,
  );
  const byUser = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = byUser.get(row.user_id) ?? [];
    bucket.push(row);
    byUser.set(row.user_id, bucket);
  }
  for (const [userId, decks] of byUser) {
    const devices = await all<{ notification_token: string; notify_study_due: number; notify_digest_only: number }>(
      env.DB,
      "SELECT notification_token, notify_study_due, notify_digest_only FROM bots_device WHERE user_id = ? AND deleted_at IS NULL",
      userId,
    );
    const targets = devices.filter((d) => d.notify_study_due === 1 && d.notify_digest_only !== 1);
    if (targets.length === 0) continue;
    const total = decks.reduce((a, d) => a + d.n, 0);
    const single = decks.length === 1 ? decks[0]! : null;
    const title = total === 1 ? "1 card is due for review" : `${total} cards are due for review`;
    const data =
      single && byUser.get(userId)!.filter((d) => d.profile_id !== single.profile_id).length === 0
        ? { type: "study_reminder", deck_id: single.deck_id, profile_id: single.profile_id }
        : { type: "study_reminder" };
    await pushToTokens(
      targets.map((d) => d.notification_token),
      "Study reminder",
      `${title} in ${single ? single.name : "your decks"}`,
      data,
    );
  }
}

export async function sendActivityDigests(env: Env, hours = 24): Promise<void> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await all<{ user_id: number; profile_name: string; n: number }>(
    env.DB,
    `SELECT ch.user_id AS user_id, pr.name AS profile_name, COUNT(*) AS n
     FROM bots_chat ch LEFT JOIN bots_profile pr ON pr.id = ch.profile_id
     WHERE ch.modified_at >= ? GROUP BY ch.user_id, pr.name`,
    since,
  );
  const byUser = new Map<number, { profile_name: string; n: number }[]>();
  for (const row of rows) {
    const bucket = byUser.get(row.user_id) ?? [];
    bucket.push({ profile_name: row.profile_name ?? "Unknown", n: row.n });
    byUser.set(row.user_id, bucket);
  }
  for (const [userId, chats] of byUser) {
    const devices = await all<{ notification_token: string; notify_digest_only: number }>(
      env.DB,
      "SELECT notification_token, notify_digest_only FROM bots_device WHERE user_id = ? AND deleted_at IS NULL",
      userId,
    );
    if (devices.length === 0) continue;
    const summary = chats.map((x) => `${x.profile_name}: ${x.n} chat${x.n === 1 ? "" : "s"}`).join(" · ");
    await pushToTokens(
      devices.map((d) => d.notification_token),
      "Syft daily summary",
      summary,
      { type: "parent_activity" },
    );
  }
}

export async function updateLastLogin(env: Env, userId: number): Promise<void> {
  await run(env.DB, "UPDATE auth_user SET last_login = ? WHERE id = ?", nowIso(), userId).catch(() => undefined);
}


