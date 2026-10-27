// AI models — port of AiModelViewSet (read-only).

import { Hono } from "hono";
import { authenticate } from "../auth";
import { all, count as dbCount, first, pageParams, paginated } from "../db";
import type { Env } from "../types";
import { aiModelRow } from "../serializers";
import { routeCtx, makeRouter } from "./helpers";

const aiModels = makeRouter();
aiModels.use("*", authenticate);

aiModels.get("/", async (c) => {
  const r = routeCtx(c);
  const p = pageParams(new URLSearchParams(c.req.query() as Record<string, string>));
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);
  const total = await dbCount(r.env.DB, "SELECT COUNT(*) AS n FROM bots_aimodel");
  const rows = await all<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_aimodel ORDER BY name ASC LIMIT ? OFFSET ?", p.limit, p.offset);
  return c.json(
    paginated(
      r.base + "/ai_models/",
      sp,
      p,
      total,
      rows.map((m) => aiModelRow(m, `${r.base}/ai_models/${m["id"]}/`)),
    ),
  );
});

aiModels.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  const raw = (c.req.param("pk") ?? "");
  const row = /^\d+$/.test(raw)
    ? await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_aimodel WHERE id = ?", parseInt(raw, 10))
    : null;
  if (!row) return c.json({ detail: "Not found." }, 404);
  return c.json(aiModelRow(row, `${r.base}/ai_models/${row["id"]}/`));
});

export default aiModels;
