// Bots — port of BotViewSet. Teens: reads OK, writes denied.
// Parent writes additionally require X-Parent-Reauth (unless PIN-less).

import { Hono } from "hono";
import { authenticate, parentReauthRequired } from "../auth";
import { all, count as dbCount, first, pageParams, paginated, run } from "../db";
import { newUuid } from "../crypto";
import { nowIso, type BotRow, type Env } from "../types";
import { botRow } from "../serializers";
import { findByUuidOrId, forbidden, routeCtx, teenScope, type TC, makeRouter } from "./helpers";

const bots = makeRouter();
bots.use("*", authenticate);

async function serializeBot(r: ReturnType<typeof routeCtx>, bot: BotRow) {
  let aiModel: string | null = null;
  if (bot.ai_model_id) {
    const m = await first<{ model_id: string }>(r.env.DB, "SELECT model_id FROM bots_aimodel WHERE id = ?", bot.ai_model_id);
    aiModel = m?.model_id ?? null;
  }
  return botRow(bot as unknown as Record<string, unknown>, aiModel, `${r.base}/bots/${bot.id}/`);
}

// GET /api/bots/
bots.get("/", async (c) => {
  const r = routeCtx(c);
  const p = pageParams(new URLSearchParams(c.req.query() as Record<string, string>));
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);
  const total = await dbCount(r.env.DB, "SELECT COUNT(*) AS n FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL", r.user.id);
  const rows = await all<BotRow>(
    r.env.DB,
    "SELECT * FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ? OFFSET ?",
    r.user.id,
    p.limit,
    p.offset,
  );
  const results = [];
  for (const b of rows) results.push(await serializeBot(r, b));
  return c.json(paginated(r.base + "/bots/", sp, p, total, results));
});

function botInput(body: Record<string, unknown>): { errors: Record<string, string[]>; value: Record<string, unknown> } {
  const errors: Record<string, string[]> = {};
  const value: Record<string, unknown> = {};
  if (typeof body["name"] !== "string" || !body["name"].trim()) {
    errors["name"] = ["This field is required."];
  } else {
    value["name"] = (body["name"] as string).slice(0, 255);
  }
  for (const f of ["system_prompt", "template_name", "color", "icon"] as const) {
    if (body[f] !== undefined) value[f] = typeof body[f] === "string" ? body[f] : null;
  }
  for (const f of ["simple_editor", "restrict_language", "restrict_adult_topics", "enable_web_search", "enable_html_pages"] as const) {
    if (body[f] !== undefined) value[f] = body[f] ? 1 : 0;
  }
  if (body["response_length"] !== undefined) {
    const n = parseInt(String(body["response_length"]), 10);
    if (!Number.isFinite(n)) errors["response_length"] = ["A valid integer is required."];
    else value["response_length"] = n;
  }
  return { errors, value };
}

// POST /api/bots/
bots.post("/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c);
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  const { errors, value } = botInput(body);
  if (Object.keys(errors).length > 0) return c.json(errors, 400);
  let aiModelId: number | null = null;
  if (body["ai_model"] !== undefined && body["ai_model"] !== null && body["ai_model"] !== "") {
    const m = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_aimodel WHERE model_id = ?", String(body["ai_model"]));
    if (!m) return c.json({ ai_model: ["Invalid pk - object does not exist."] }, 400);
    aiModelId = m.id;
  }
  const now = nowIso();
  const botId = newUuid();
  await run(
    r.env.DB,
    `INSERT INTO bots_bot (user_id, ai_model_id, bot_id, name, system_prompt, simple_editor, template_name, response_length,
      restrict_language, restrict_adult_topics, enable_web_search, enable_html_pages, color, icon, created_at, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.user.id,
    aiModelId,
    botId,
    value["name"],
    (value["system_prompt"] as string | null) ?? null,
    (value["simple_editor"] as number) ?? 0,
    (value["template_name"] as string | null) ?? null,
    (value["response_length"] as number) ?? 200,
    value["restrict_language"] ?? 1,
    value["restrict_adult_topics"] ?? 1,
    value["enable_web_search"] ?? 0,
    value["enable_html_pages"] ?? 0,
    (value["color"] as string | null) ?? null,
    (value["icon"] as string | null) ?? null,
    now,
    now,
  );
  const bot = (await first<BotRow>(r.env.DB, "SELECT * FROM bots_bot WHERE bot_id = ?", botId))!;
  return c.json(await serializeBot(r, bot), 201);
});

async function getOwnedBot(c: TC, r: ReturnType<typeof routeCtx>) {
  const raw = (c.req.param("pk") ?? "");
  const bot = await findByUuidOrId<BotRow>(r.env.DB, "bots_bot", "bot_id", raw);
  if (!bot) return { error: c.json({ detail: "Not found." }, 404) as Response };
  if (bot.user_id !== r.user.id) return { error: c.json({ detail: "Not found." }, 403) as Response };
  return { bot };
}

// GET /api/bots/:pk/
bots.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedBot(c, r);
  if ("error" in found) return found.error;
  return c.json(await serializeBot(r, found.bot));
});

// PUT/PATCH /api/bots/:pk/
async function updateBot(c: TC, partial: boolean) {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c);
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");
  const found = await getOwnedBot(c, r);
  if ("error" in found) return found.error;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  if (!partial && (typeof body["name"] !== "string" || !body["name"].trim())) {
    return c.json({ name: ["This field is required."] }, 400);
  }
  const sets: string[] = ["modified_at = ?"];
  const params: unknown[] = [nowIso()];
  const push = (col: string, v: unknown): void => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (body["name"] !== undefined) push("name", String(body["name"]).slice(0, 255));
  if (body["system_prompt"] !== undefined) push("system_prompt", typeof body["system_prompt"] === "string" ? body["system_prompt"] : null);
  if (body["template_name"] !== undefined) push("template_name", typeof body["template_name"] === "string" ? body["template_name"] : null);
  if (body["color"] !== undefined) push("color", typeof body["color"] === "string" ? body["color"] : null);
  if (body["icon"] !== undefined) push("icon", typeof body["icon"] === "string" ? body["icon"] : null);
  for (const f of ["simple_editor", "restrict_language", "restrict_adult_topics", "enable_web_search", "enable_html_pages"] as const) {
    if (body[f] !== undefined) push(f, body[f] ? 1 : 0);
  }
  if (body["response_length"] !== undefined) {
    const n = parseInt(String(body["response_length"]), 10);
    if (!Number.isFinite(n)) return c.json({ response_length: ["A valid integer is required."] }, 400);
    push("response_length", n);
  }
  if (body["ai_model"] !== undefined) {
    if (body["ai_model"] === null || body["ai_model"] === "") {
      push("ai_model_id", null);
    } else {
      const m = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_aimodel WHERE model_id = ?", String(body["ai_model"]));
      if (!m) return c.json({ ai_model: ["Invalid pk - object does not exist."] }, 400);
      push("ai_model_id", m.id);
    }
  }
  params.push(found.bot.id);
  await run(r.env.DB, `UPDATE bots_bot SET ${sets.join(", ")} WHERE id = ?`, ...params);
  const bot = (await first<BotRow>(r.env.DB, "SELECT * FROM bots_bot WHERE id = ?", found.bot.id))!;
  return c.json(await serializeBot(r, bot));
}

bots.put("/:pk/", (c) => updateBot(c, false));
bots.patch("/:pk/", (c) => updateBot(c, true));

// DELETE /api/bots/:pk/
bots.delete("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c);
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");
  const found = await getOwnedBot(c, r);
  if ("error" in found) return found.error;
  // Django parity: hard-delete the row (Bot has no soft-delete override).
  await run(r.env.DB, "DELETE FROM bots_bot WHERE id = ?", found.bot.id);
  return c.body(null, 204);
});

export default bots;
