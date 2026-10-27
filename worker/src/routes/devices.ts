// Devices — port of DeviceViewSet (Expo push token registry).

import { Hono } from "hono";
import { authenticate } from "../auth";
import { all, count as dbCount, first, pageParams, paginated, run } from "../db";
import { newUuid } from "../crypto";
import { nowIso, type Env } from "../types";
import { deviceRow } from "../serializers";
import { findByUuidOrId, routeCtx, teenScope, type TC, makeRouter } from "./helpers";

const devices = makeRouter();
devices.use("*", authenticate);

interface DeviceInput {
  notification_token?: unknown;
  notify_on_new_chat?: unknown;
  notify_on_new_message?: unknown;
  notify_digest_only?: unknown;
  notify_study_due?: unknown;
}

const boolField = (v: unknown, dflt: boolean): boolean => (v === undefined ? dflt : v === true || v === "true" || v === 1);

// GET /api/devices/?notificationToken=
devices.get("/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const token = c.req.query("notificationToken");
  const p = pageParams(new URLSearchParams(c.req.query() as Record<string, string>));
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);

  let where = "user_id = ? AND deleted_at IS NULL";
  const params: unknown[] = [r.user.id];
  if (scope.teen) {
    // Teens may only look up their own device by exact token — never list.
    if (!token) return c.json(paginated(r.base + "/devices/", sp, p, 0, []));
  }
  if (token) {
    where += " AND notification_token = ?";
    params.push(token);
  }
  const total = await dbCount(r.env.DB, `SELECT COUNT(*) AS n FROM bots_device WHERE ${where}`, ...params);
  const rows = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT * FROM bots_device WHERE ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
    ...params,
    p.limit,
    p.offset,
  );
  return c.json(
    paginated(
      r.base + "/devices/",
      sp,
      p,
      total,
      rows.map((d) => deviceRow(d, `${r.base}/devices/${d["id"]}/`)),
    ),
  );
});

// POST /api/devices/ — create or revive soft-deleted row
devices.post("/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const body = (await c.req.json().catch(() => null)) as DeviceInput | null;
  if (!body || typeof body["notification_token"] !== "string" || !body["notification_token"]) {
    return c.json({ notification_token: ["This field is required."] }, 400);
  }
  const token = body["notification_token"] as string;
  const now = nowIso();

  const live = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_device WHERE notification_token = ? AND deleted_at IS NULL", token);
  if (live) return c.json({ notification_token: ["notification token exists"] }, 400);
  const deleted = await first<Record<string, unknown>>(
    r.env.DB,
    "SELECT * FROM bots_device WHERE notification_token = ? AND deleted_at IS NOT NULL",
    token,
  );
  const flags = scope.teen
    ? { chat: 0, message: 0, digest: 0, study: boolField(body["notify_study_due"], false) }
    : {
        chat: boolField(body["notify_on_new_chat"], false),
        message: boolField(body["notify_on_new_message"], true),
        digest: boolField(body["notify_digest_only"], false),
        study: boolField(body["notify_study_due"], false),
      };
  if (deleted) {
    await run(
      r.env.DB,
      "UPDATE bots_device SET user_id = ?, notify_on_new_chat = ?, notify_on_new_message = ?, notify_digest_only = ?, notify_study_due = ?, deleted_at = NULL, modified_at = ? WHERE id = ?",
      r.user.id,
      flags.chat ? 1 : 0,
      flags.message ? 1 : 0,
      flags.digest ? 1 : 0,
      flags.study ? 1 : 0,
      now,
      deleted["id"],
    );
    const row = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_device WHERE id = ?", deleted["id"]))!;
    return c.json(deviceRow(row, `${r.base}/devices/${row["id"]}/`), 200);
  }
  const deviceId = newUuid();
  await run(
    r.env.DB,
    `INSERT INTO bots_device (user_id, device_id, notification_token, notify_on_new_chat, notify_on_new_message, notify_digest_only, notify_study_due, created_at, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.user.id,
    deviceId,
    token,
    flags.chat ? 1 : 0,
    flags.message ? 1 : 0,
    flags.digest ? 1 : 0,
    flags.study ? 1 : 0,
    now,
    now,
  );
  const row = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_device WHERE device_id = ?", deviceId))!;
  return c.json(deviceRow(row, `${r.base}/devices/${row["id"]}/`), 201);
});

async function getVisible(c: TC, r: ReturnType<typeof routeCtx>) {
  const raw = (c.req.param("pk") ?? "");
  const scope = await teenScope(r);
  let row: Record<string, unknown> | null;
  if (scope.teen) {
    if (!/^[0-9a-f-]{36}$/i.test(raw)) return { error: c.json({ detail: "Not found." }, 404) as Response };
    row = await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_device WHERE device_id = ? AND deleted_at IS NULL", raw.toLowerCase());
  } else {
    row = await findByUuidOrId<Record<string, unknown>>(r.env.DB, "bots_device", "device_id", raw);
    if (row && (row["deleted_at"] as string | null) !== null) row = null;
  }
  if (!row) return { error: c.json({ detail: "Not found." }, 404) as Response };
  if ((row["user_id"] as number) !== r.user.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  return { row };
}

// GET /api/devices/:pk/
devices.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  const found = await getVisible(c, r);
  if ("error" in found) return found.error;
  return c.json(deviceRow(found.row, `${r.base}/devices/${found.row["id"]}/`));
});

// PUT/PATCH /api/devices/:pk/
async function updateDevice(c: TC, r: ReturnType<typeof routeCtx>) {
  const found = await getVisible(c, r);
  if ("error" in found) return found.error;
  const scope = await teenScope(r);
  const body = (await c.req.json().catch(() => null)) as DeviceInput | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  if (scope.teen) {
    // Only notify_study_due may change; everything else must round-trip.
    const same = (k: string, cur: unknown): boolean => {
      if (body[k as keyof DeviceInput] === undefined) return true;
      const v = body[k as keyof DeviceInput];
      const norm = (x: unknown): string => String(x === true || x === "true" || x === 1 ? true : x === false || x === "false" || x === 0 ? false : x);
      return norm(v) === norm(cur);
    };
    const row = found.row;
    if (
      !same("notification_token", row["notification_token"]) ||
      !same("notify_on_new_chat", !!row["notify_on_new_chat"]) ||
      !same("notify_on_new_message", !!row["notify_on_new_message"]) ||
      !same("notify_digest_only", !!row["notify_digest_only"]) ||
      (body["deleted_at" as keyof DeviceInput] !== undefined && (body as Record<string, unknown>)["deleted_at"] !== null)
    ) {
      return c.json({ detail: "You do not have permission to perform this action." }, 403);
    }
    if (body["notification_token"] !== undefined && body["notification_token"] !== row["notification_token"]) {
      const dup = await first<{ id: number }>(
        r.env.DB,
        "SELECT id FROM bots_device WHERE notification_token = ? AND deleted_at IS NULL AND id != ?",
        String(body["notification_token"]),
        row["id"],
      );
      if (dup) return c.json({ notification_token: ["notification token exists"] }, 400);
    }
  } else if (body["notification_token"] !== undefined && body["notification_token"] !== found.row["notification_token"]) {
    const dup = await first<{ id: number }>(
      r.env.DB,
      "SELECT id FROM bots_device WHERE notification_token = ? AND deleted_at IS NULL AND id != ?",
      String(body["notification_token"]),
      found.row["id"],
    );
    if (dup) return c.json({ notification_token: ["notification token exists"] }, 400);
  }
  const sets: string[] = ["modified_at = ?"];
  const params: unknown[] = [nowIso()];
  const push = (col: string, v: unknown): void => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (body["notification_token"] !== undefined) push("notification_token", String(body["notification_token"]));
  for (const f of ["notify_on_new_chat", "notify_on_new_message", "notify_digest_only", "notify_study_due"] as const) {
    if (body[f] !== undefined) push(f, boolField(body[f], false) ? 1 : 0);
  }
  params.push(found.row["id"]);
  await run(r.env.DB, `UPDATE bots_device SET ${sets.join(", ")} WHERE id = ?`, ...params);
  const row = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_device WHERE id = ?", found.row["id"]))!;
  return c.json(deviceRow(row, `${r.base}/devices/${row["id"]}/`));
}

devices.put("/:pk/", async (c) => updateDevice(c, routeCtx(c)));
devices.patch("/:pk/", async (c) => updateDevice(c, routeCtx(c)));

// DELETE /api/devices/:pk/
devices.delete("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return c.json({ detail: "You do not have permission to perform this action." }, 403);
  const found = await getVisible(c, r);
  if ("error" in found) return found.error;
  await run(r.env.DB, "UPDATE bots_device SET deleted_at = ?, modified_at = ? WHERE id = ?", nowIso(), nowIso(), found.row["id"]);
  return c.body(null, 204);
});

export default devices;
