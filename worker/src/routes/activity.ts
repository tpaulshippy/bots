// Activity (parent inbox) + kid stats — port of ActivityChatViewSet,
// ActivitySummaryViewSet, StatsViewSet. Parent-only except stats (teen OK).

import { Hono } from "hono";
import { authenticate, isTeenDelegated } from "../auth";
import { all, count as dbCount, first, resolvePage, paginated } from "../db";
import { forbidden } from "../auth";
import type { Env } from "../types";
import { getProfileStats } from "../stats";
import { activityChatRow, activitySafetyRow, messageRow } from "../serializers";
import { findByUuidOrId, isUuid, makeRouter, routeCtx, teenScope, uuidMatch } from "./helpers";

const activity = makeRouter();
activity.use("*", authenticate);

function parentOnly(r: ReturnType<typeof routeCtx>): boolean {
  return isTeenDelegated(r.auth);
}

// GET /api/activity/chats/?profileId=&botId=&since=&until=&hasSafetyEvent=
activity.get("/chats/", async (c) => {
  const r = routeCtx(c);
  if (parentOnly(r)) return forbidden(c);
  const q = c.req.query();
  const sp = new URLSearchParams(q as Record<string, string>);

  const filters: string[] = ["ch.user_id = ?"];
  const params: unknown[] = [r.user.id];

  if (q["profileId"]) {
    const match = uuidMatch("pr.profile_id", q["profileId"]);
    if (!match) return c.json({ profileId: ["Invalid UUID."] }, 400);
    filters.push(match.sql);
    params.push(...match.params);
  }
  if (q["botId"]) {
    const match = uuidMatch("b.bot_id", q["botId"]);
    if (!match) return c.json({ botId: ["Invalid UUID."] }, 400);
    filters.push(match.sql);
    params.push(...match.params);
  }
  if (q["since"]) {
    const d = new Date(q["since"]);
    if (Number.isNaN(d.getTime())) return c.json({ since: ["Invalid datetime. Use ISO 8601."] }, 400);
    filters.push("ch.modified_at >= ?");
    params.push(d.toISOString());
  }
  if (q["until"]) {
    const d = new Date(q["until"]);
    if (Number.isNaN(d.getTime())) return c.json({ until: ["Invalid datetime. Use ISO 8601."] }, 400);
    filters.push("ch.modified_at <= ?");
    params.push(d.toISOString());
  }
  if ((q["hasSafetyEvent"] ?? "").toLowerCase() === "true") {
    filters.push("ch.id IN (SELECT chat_id FROM bots_safetyevent WHERE chat_id IS NOT NULL)");
  }
  const where = filters.join(" AND ");

  const total = await dbCount(
    r.env.DB,
    `SELECT COUNT(*) AS n FROM bots_chat ch LEFT JOIN bots_profile pr ON pr.id = ch.profile_id LEFT JOIN bots_bot b ON b.id = ch.bot_id WHERE ${where}`,
    ...params,
  );
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
  const rows = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT ch.*, pr.profile_id AS profile_slug, pr.name AS profile_name,
       b.bot_id AS bot_slug, b.name AS bot_name, b.color AS bot_color, b.icon AS bot_icon,
       (SELECT COUNT(DISTINCT m.id) FROM bots_message m WHERE m.chat_id = ch.id AND m.role != 'system') AS message_count,
       (SELECT m2.text FROM bots_message m2 WHERE m2.chat_id = ch.id AND m2.role != 'system' ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1) AS last_message_preview,
       (SELECT m3.created_at FROM bots_message m3 WHERE m3.chat_id = ch.id AND m3.role != 'system' ORDER BY m3.created_at DESC, m3.id DESC LIMIT 1) AS last_message_at,
       (SELECT COUNT(DISTINCT s.id) FROM bots_safetyevent s WHERE s.chat_id = ch.id) AS safety_event_count
     FROM bots_chat ch LEFT JOIN bots_profile pr ON pr.id = ch.profile_id LEFT JOIN bots_bot b ON b.id = ch.bot_id
     WHERE ${where} ORDER BY ch.modified_at DESC LIMIT ? OFFSET ?`,
    ...params,
    p.limit,
    p.offset,
  );
  const results = rows.map((row) => ({
    ...activityChatRow({
      ...row,
      profile_pk: row["profile_slug"] ? 1 : null,
      bot_pk: row["bot_slug"] ? 1 : null,
    }),
  }));
  return c.json(paginated(r.base + "/activity/chats/", sp, p, total, results));
});

// GET /api/activity/chats/:pk/
activity.get("/chats/:pk/", async (c) => {
  const r = routeCtx(c);
  if (parentOnly(r)) return forbidden(c);
  const chat = await findByUuidOrId<Record<string, unknown>>(r.env.DB, "bots_chat", "chat_id", (c.req.param("pk") ?? ""));
  if (!chat || (chat["user_id"] as number) !== r.user.id) return c.json({ detail: "Not found." }, 404);
  const profile = chat["profile_id"]
    ? await first<{ profile_id: string; name: string }>(r.env.DB, "SELECT profile_id, name FROM bots_profile WHERE id = ?", chat["profile_id"])
    : null;
  const bot = chat["bot_id"]
    ? await first<{ bot_id: string; name: string; color: string | null; icon: string | null }>(
        r.env.DB,
        "SELECT bot_id, name, color, icon FROM bots_bot WHERE id = ?",
        chat["bot_id"],
      )
    : null;
  const messages = await all<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_message WHERE chat_id = ? AND role != 'system' ORDER BY id ASC", chat["id"]);
  const events = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT s.*, m."order" AS message_order FROM bots_safetyevent s LEFT JOIN bots_message m ON m.id = s.message_id WHERE s.chat_id = ? ORDER BY s.created_at ASC, s.id ASC`,
    chat["id"],
  );
  const ctx = { env: r.env, base: r.base };
  return c.json({
    chat_id: chat["chat_id"],
    title: chat["title"],
    profile: profile ? { profile_id: profile.profile_id, name: profile.name } : null,
    bot: bot ? { bot_id: bot.bot_id, name: bot.name, color: bot.color, icon: bot.icon } : null,
    message_count: messages.length,
    messages: await Promise.all(messages.map((m) => messageRow(ctx, m))),
    safety_events: events.map(activitySafetyRow),
  });
});

// GET /api/activity/summary/?days=
activity.get("/summary/", async (c) => {
  const r = routeCtx(c);
  if (parentOnly(r)) return forbidden(c);
  let days = 7;
  const raw = c.req.query("days");
  if (raw !== undefined) {
    const n = parseInt(raw, 10);
    days = Number.isFinite(n) ? Math.max(1, Math.min(n, 365)) : 7;
  }
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const profiles = await all<{ id: number; profile_id: string; name: string }>(
    r.env.DB,
    "SELECT id, profile_id, name FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
    r.user.id,
  );
  const chatCounts = await all<{ profile_id: number; c: number }>(
    r.env.DB,
    "SELECT profile_id, COUNT(*) AS c FROM bots_chat WHERE user_id = ? AND modified_at >= ? AND profile_id IS NOT NULL GROUP BY profile_id",
    r.user.id,
    since,
  );
  const msgCounts = await all<{ profile_id: number; c: number }>(
    r.env.DB,
    `SELECT ch.profile_id AS profile_id, COUNT(*) AS c FROM bots_message m JOIN bots_chat ch ON ch.id = m.chat_id
     WHERE ch.user_id = ? AND ch.modified_at >= ? AND m.role != 'system' AND ch.profile_id IS NOT NULL GROUP BY ch.profile_id`,
    r.user.id,
    since,
  );
  const topRows = await all<{ profile_id: number; name: string | null; count: number }>(
    r.env.DB,
    `SELECT ch.profile_id AS profile_id, b.name AS name, COUNT(*) AS count FROM bots_chat ch JOIN bots_bot b ON b.id = ch.bot_id
     WHERE ch.user_id = ? AND ch.modified_at >= ? AND ch.profile_id IS NOT NULL AND ch.bot_id IS NOT NULL
     GROUP BY ch.profile_id, b.name ORDER BY ch.profile_id ASC, count DESC`,
    r.user.id,
    since,
  );
  const safetyCounts = await all<{ profile_id: number; c: number }>(
    r.env.DB,
    "SELECT profile_id, COUNT(*) AS c FROM bots_safetyevent WHERE user_id = ? AND created_at >= ? AND profile_id IS NOT NULL GROUP BY profile_id",
    r.user.id,
    since,
  );
  const byId = <T extends { profile_id: number; c: number }>(rows: T[]): Map<number, number> =>
    new Map(rows.map((x) => [x.profile_id, x.c]));
  const chatBy = byId(chatCounts);
  const msgBy = byId(msgCounts);
  const safetyBy = byId(safetyCounts);
  const topBy = new Map<number, { name: string | null; count: number }[]>();
  for (const row of topRows) {
    const bucket = topBy.get(row.profile_id) ?? [];
    if (bucket.length < 3) bucket.push({ name: row.name, count: row.count });
    topBy.set(row.profile_id, bucket);
  }
  return c.json({
    profiles: profiles.map((prof) => ({
      profile_id: prof.profile_id,
      name: prof.name,
      chat_count: chatBy.get(prof.id) ?? 0,
      message_count: msgBy.get(prof.id) ?? 0,
      safety_event_count: safetyBy.get(prof.id) ?? 0,
      top_bots: topBy.get(prof.id) ?? [],
    })),
  });
});

export const statsApp = makeRouter();

// GET /api/stats/?profileId= — kid-visible; teens locked to claimed profile.
statsApp.get("/", authenticate, async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  let profileId: number | null = null;
  if (scope.profile) {
    profileId = scope.profile.id;
  } else if (scope.teen) {
    return c.json({ profileId: ["Invalid or unauthorized profile ID."] }, 400);
  } else {
    const param = c.req.query("profileId");
    if (!param) return c.json({ profileId: ["Invalid or unauthorized profile ID."] }, 400);
    if (!isUuid(param)) return c.json({ profileId: ["Invalid or unauthorized profile ID."] }, 400);
    const prof = await findByUuidOrId<{ id: number; user_id: number; deleted_at: string | null }>(
      r.env.DB,
      "bots_profile",
      "profile_id",
      param,
    );
    if (!prof || prof.user_id !== r.user.id || prof.deleted_at !== null) return c.json({ detail: "Not found." }, 404);
    profileId = prof.id;
  }
  const stats = await getProfileStats(r.env.DB, profileId);
  if (!stats) return c.json({ detail: "Not found." }, 404);
  return c.json(stats);
});

export default activity;
