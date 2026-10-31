// Devices — port of DeviceViewSet (Expo push token registry).

import { Hono } from "hono";
import { authenticate } from "../auth";
import { all, count as dbCount, first, resolvePage, paginated, run } from "../db";
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
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);

  let where = "user_id = ? AND deleted_at IS NULL";
  const params: unknown[] = [r.user.id];
  if (scope.teen) {
    // Teens may only look up their own device by exact token — never list.
    if (!token) {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/devices/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
  }
  if (token) {
    where += " AND notification_token = ?";
    params.push(token);
  }
  const total = await dbCount(r.env.DB, `SELECT COUNT(*) AS n FROM bots_device WHERE ${where}`, ...params);
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
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
    "SELECT * FROM bots_device WHERE user_id = ? AND notification_token = ? AND deleted_at IS NOT NULL",
    r.user.id,
    token,
  );
  if (!deleted) {
    // Taken in any other state (another user's live or deleted row): same
    // 400 Django's global validator gives, instead of a DB-constraint 500.
    const taken = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_device WHERE notification_token = ?", token);
    if (taken) return c.json({ notification_token: ["notification token exists"] }, 400);
  }
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
    // Only notify_study_due may change; everything else must round-trip
    // (Django's _field_unchanged semantics: bool vs "true"/"1" strings
    // match, anything else — including ints — does not).
    const same = (curBool: boolean, incoming: unknown): boolean => {
      if (incoming === undefined) return true;
      if (typeof incoming === "boolean") return incoming === curBool;
      if (typeof incoming === "string") return curBool === (incoming.toLowerCase() === "true" || incoming === "1");
      return false;
    };
    const row = found.row;
    if (typeof body !== "object" || body === null) {
      return c.json({ detail: "You do not have permission to perform this action." }, 403);
    }
    if (
      (body["notification_token"] !== undefined && body["notification_token"] !== row["notification_token"]) ||
      !same(!!row["notify_on_new_chat"], body["notify_on_new_chat"]) ||
      !same(!!row["notify_on_new_message"], body["notify_on_new_message"]) ||
      !same(!!row["notify_digest_only"], body["notify_digest_only"]) ||
      (body["deleted_at" as keyof DeviceInput] !== undefined && (body as Record<string, unknown>)["deleted_at"] !== null)
    ) {
      return c.json({ detail: "You do not have permission to perform this action." }, 403);
    }
  }
  if (body["notification_token"] !== undefined && body["notification_token"] !== found.row["notification_token"]) {
    // Global check like Django's (live or soft-deleted, any user): 400 here
    // instead of a table-UNIQUE 500.
    const dup = await first<{ id: number }>(
      r.env.DB,
      "SELECT id FROM bots_device WHERE notification_token = ? AND id != ?",
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
  if (body["notification_token"] !== undefined) {
    if (typeof body["notification_token"] !== "string" || !body["notification_token"]) {
      return c.json({ notification_token: ["This field may not be blank."] }, 400);
    }
    push("notification_token", body["notification_token"]);
  }
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
