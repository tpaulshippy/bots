// Chats + messages + turn endpoints.
// Port of ChatViewSet, MessageViewSet, get_chat_response, stream_chat_response.

import { Hono } from "hono";
import { authenticate } from "../auth";
import { all, count as dbCount, first, resolvePage, paginated } from "../db";
import { nowIso, type BotRow, type ChatRow, type Env, type MessageRow, type ProfileRow } from "../types";
import { botRow, messageRow, profileIdNested, type Ctx } from "../serializers";
import { findByUuidOrId, uuidMatch, routeCtx, teenScope, makeRouter } from "./helpers";

const chats = makeRouter();
chats.use("*", authenticate);

async function serializeChatList(r: ReturnType<typeof routeCtx>, chat: ChatRow, messageCount: number) {
  const profile = chat.profile_id ? await first<ProfileRow>(r.env.DB, "SELECT * FROM bots_profile WHERE id = ?", chat.profile_id) : null;
  const bot = chat.bot_id ? await first<BotRow>(r.env.DB, "SELECT * FROM bots_bot WHERE id = ?", chat.bot_id) : null;
  let aiModel: string | null = null;
  if (bot?.ai_model_id) {
    const m = await first<{ model_id: string }>(r.env.DB, "SELECT model_id FROM bots_aimodel WHERE id = ?", bot.ai_model_id);
    aiModel = m?.model_id ?? null;
  }
  const profileWithUrl = profile ? { ...profile, url: profile ? `${r.base}/profiles/${profile.id}/` : null } : null;
  return {
    id: chat.id,
    chat_id: chat.chat_id,
    profile: profile ? { ...profileIdNested(profileWithUrl), url: `${r.base}/profiles/${profile.id}/` } : null,
    bot: bot ? botRow(bot as unknown as Record<string, unknown>, aiModel, `${r.base}/bots/${bot.id}/`) : null,
    title: chat.title,
    message_count: messageCount,
    input_tokens: chat.input_tokens,
    output_tokens: chat.output_tokens,
    created_at: chat.created_at,
    modified_at: chat.modified_at,
    url: `${r.base}/chats/${chat.id}/`,
  };
}

// GET /api/chats/?profileId=&page=
chats.get("/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const profileId = c.req.query("profileId");
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);

  let where = "c.user_id = ?";
  const params: unknown[] = [r.user.id];
  if (scope.teen) {
    if (!scope.profile) {
      {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/chats/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    }
    where += " AND c.profile_id = ?";
    params.push(scope.profile.id);
  } else if (profileId) {
    const match = uuidMatch("profile_id", profileId);
    if (!match) {
      {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/chats/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    }
    const prof = await first<ProfileRow>(r.env.DB, `SELECT id FROM bots_profile WHERE ${match.sql} AND user_id = ?`, ...match.params, r.user.id);
    if (!prof) {
      {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/chats/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    }
    where += " AND c.profile_id = ?";
    params.push(prof.id);
  }

  const total = await dbCount(r.env.DB, `SELECT COUNT(*) AS n FROM bots_chat c WHERE ${where}`, ...params);
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
  const rows = await all<ChatRow & { message_count: number }>(
    r.env.DB,
    `SELECT c.*, (SELECT COUNT(*) FROM bots_message m WHERE m.chat_id = c.id) AS message_count
     FROM bots_chat c WHERE ${where} ORDER BY c.modified_at DESC LIMIT ? OFFSET ?`,
    ...params,
    p.limit,
    p.offset,
  );
  const results = [];
  for (const row of rows) results.push(await serializeChatList(r, row, row.message_count));
  return c.json(paginated(r.base + "/chats/", sp, p, total, results));
});

// GET /api/chats/:pk/
chats.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const raw = (c.req.param("pk") ?? "");
  const chat = await findByUuidOrId<ChatRow>(r.env.DB, "bots_chat", "chat_id", raw);
  if (!chat || chat.user_id !== r.user.id) return c.json({ detail: "Not found." }, 404);
  if (scope.teen) {
    if (!scope.profile) return c.json({ detail: "Not found." }, 404);
    if (chat.profile_id !== scope.profile.id) return c.json({ detail: "Not found." }, 404);
  }
  const profile = chat.profile_id ? await first<ProfileRow>(r.env.DB, "SELECT * FROM bots_profile WHERE id = ?", chat.profile_id) : null;
  const profileWithUrl = profile ? { ...profile, url: `${r.base}/profiles/${profile.id}/` } : null;
  const messages = await all<MessageRow>(r.env.DB, "SELECT * FROM bots_message WHERE chat_id = ? ORDER BY id ASC", chat.id);
  const ctx: Ctx = { env: r.env, base: r.base };
  return c.json({
    id: chat.id,
    chat_id: chat.chat_id,
    profile: profile ? { ...profileIdNested(profileWithUrl), url: `${r.base}/profiles/${profile.id}/` } : null,
    title: chat.title,
    messages: await Promise.all(messages.map((m) => messageRow(ctx, m as unknown as Record<string, unknown>))),
    input_tokens: chat.input_tokens,
    output_tokens: chat.output_tokens,
    created_at: chat.created_at,
    modified_at: chat.modified_at,
  });
});

// GET /api/chats/:chat_pk/messages/
chats.get("/:chat_pk/messages/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const raw = (c.req.param("chat_pk") ?? "");
  if (scope.teen && !scope.profile) return c.json({ detail: "Not found." }, 404);
  const chat = await findByUuidOrId<ChatRow>(r.env.DB, "bots_chat", "chat_id", raw);
  if (!chat || chat.user_id !== r.user.id) return c.json({ detail: "Not found." }, 404);
  if (scope.profile && chat.profile_id !== scope.profile.id) return c.json({ detail: "Not found." }, 404);
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);
  const total = await dbCount(r.env.DB, "SELECT COUNT(*) AS n FROM bots_message WHERE chat_id = ? AND role != 'system'", chat.id);
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
  const messages = await all<MessageRow>(
    r.env.DB,
    "SELECT * FROM bots_message WHERE chat_id = ? AND role != 'system' ORDER BY id ASC LIMIT ? OFFSET ?",
    chat.id,
    p.limit,
    p.offset,
  );
  const ctx: Ctx = { env: r.env, base: r.base };
  const results = await Promise.all(messages.map((m) => messageRow(ctx, m as unknown as Record<string, unknown>)));
  return c.json(paginated(`${r.base}/chats/${raw}/messages/`, sp, p, total, results));
});

chats.get("/:chat_pk/messages/:pk/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const chatRaw = (c.req.param("chat_pk") ?? "");
  if (scope.teen && !scope.profile) return c.json({ detail: "Not found." }, 404);
  const chat = await findByUuidOrId<ChatRow>(r.env.DB, "bots_chat", "chat_id", chatRaw);
  if (!chat || chat.user_id !== r.user.id) return c.json({ detail: "Not found." }, 404);
  if (scope.profile && chat.profile_id !== scope.profile.id) return c.json({ detail: "Not found." }, 404);
  const msgRaw = (c.req.param("pk") ?? "");
  const msg = await findByUuidOrId<MessageRow>(r.env.DB, "bots_message", "message_id", msgRaw);
  if (!msg || msg.chat_id !== chat.id || msg.role === "system") return c.json({ detail: "Not found." }, 404);
  const ctx: Ctx = { env: r.env, base: r.base };
  return c.json(await messageRow(ctx, msg as unknown as Record<string, unknown>));
});

export default chats;
