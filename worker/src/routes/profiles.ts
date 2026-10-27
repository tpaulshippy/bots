// Profiles — port of ProfileViewSet. Parent-only CRUD + teen self-read.
// Parent writes require X-Parent-Reauth (unless PIN-less).

import { Hono } from "hono";
import { authenticate, parentReauthRequired } from "../auth";
import { all, count as dbCount, first, resolvePage, paginated, run } from "../db";
import { newUuid } from "../crypto";
import { allowedFile, storeUpload } from "../images";
import { nowIso, type Env, type ProfileRow } from "../types";
import { ownProfileRow, profileRow } from "../serializers";
import { findByUuidOrId, forbidden, photoUrl, routeCtx, teenScope, type TC, makeRouter } from "./helpers";

const profiles = makeRouter();
profiles.use("*", authenticate);

async function serializeProfile(r: ReturnType<typeof routeCtx>, p: ProfileRow) {
  return profileRow({ ...p, photo_url: await photoUrl(r, p.photo_filename) });
}

function cleanEmail(db: D1Database, value: unknown, excludeId?: number): Promise<{ ok: true; value: string | null } | { ok: false; detail: string }> {
  return (async () => {
    if (value === null || value === undefined) return { ok: true as const, value: null };
    const s = String(value).trim();
    if (s === "") return { ok: true as const, value: null };
    const normalized = s.toLowerCase();
    // Django's EmailField validates format and caps at 254 chars.
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { ok: false as const, detail: "Enter a valid email address." };
    }
    let sql = "SELECT id FROM bots_profile WHERE oauth_email = ? AND deleted_at IS NULL";
    const params: unknown[] = [normalized];
    if (excludeId !== undefined) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const conflict = await first<{ id: number }>(db, sql, ...params);
    if (conflict) return { ok: false as const, detail: "That email is already used by another profile." };
    return { ok: true as const, value: normalized };
  })();
}

// GET /api/profiles/
profiles.get("/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
    const sp = new URLSearchParams(c.req.query() as Record<string, string>);
  const total = await dbCount(r.env.DB, "SELECT COUNT(*) AS n FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL", r.user.id);
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
  const rows = await all<ProfileRow>(
    r.env.DB,
    "SELECT * FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ? OFFSET ?",
    r.user.id,
    p.limit,
    p.offset,
  );
  const results = [];
  for (const row of rows) results.push(await serializeProfile(r, row));
  return c.json(paginated(r.base + "/profiles/", sp, p, total, results));
});

async function createOrUpdate(c: TC, existing: ProfileRow | null, partial: boolean) {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");

  const ctype = c.req.header("content-type") ?? "";
  let name: unknown;
  let oauthEmail: unknown;
  let removePhoto = false;
  let photo: File | null = null;
  if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    name = form["name"];
    oauthEmail = form["oauth_email"];
    removePhoto = form["remove_photo"] === "true" || (form["remove_photo"] as unknown as boolean) === true;
    const f = form["photo"];
    photo = f instanceof File ? f : null;
  } else {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
    name = body["name"];
    oauthEmail = body["oauth_email"];
    removePhoto = body["remove_photo"] === true;
  }

  if ((!existing || !partial) && (typeof name !== "string" || !name.trim())) {
    return c.json({ name: [existing ? "This field may not be blank." : "This field is required."] }, 400);
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return c.json({ name: ["This field may not be blank."] }, 400);
  }
  const email = await cleanEmail(r.env.DB, oauthEmail, existing?.id);
  if (!email.ok) return c.json({ oauth_email: [email.detail] }, 400);

  let photoFilename: string | null | undefined;
  if (photo) {
    if (photo.size > 20 * 1024 * 1024) return c.json({ photo: ["File size exceeds 20MB limit."] }, 400);
    if (!allowedFile(photo.name)) return c.json({ photo: ["Invalid file type."] }, 400);
    photoFilename = await storeUpload(r.env, await photo.arrayBuffer(), photo.name);
  } else if (removePhoto) {
    photoFilename = null;
  }

  const now = nowIso();
  if (!existing) {
    const profileId = newUuid();
    await run(
      r.env.DB,
      "INSERT INTO bots_profile (user_id, profile_id, name, oauth_email, photo_filename, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      r.user.id,
      profileId,
      (name as string).trim().slice(0, 255),
      email.ok ? email.value : null,
      photoFilename ?? null,
      now,
      now,
    );
    const row = (await first<ProfileRow>(r.env.DB, "SELECT * FROM bots_profile WHERE profile_id = ?", profileId))!;
    return c.json(await serializeProfile(r, row), 201);
  }
  const sets: string[] = ["modified_at = ?"];
  const params: unknown[] = [now];
  if (name !== undefined) {
    sets.push("name = ?");
    params.push((name as string).trim().slice(0, 255));
  }
  if (oauthEmail !== undefined) {
    sets.push("oauth_email = ?");
    params.push(email.ok ? email.value : null);
  }
  if (photoFilename !== undefined) {
    sets.push("photo_filename = ?");
    params.push(photoFilename);
  }
  params.push(existing.id);
  await run(r.env.DB, `UPDATE bots_profile SET ${sets.join(", ")} WHERE id = ?`, ...params);
  const row = (await first<ProfileRow>(r.env.DB, "SELECT * FROM bots_profile WHERE id = ?", existing.id))!;
  return c.json(await serializeProfile(r, row));
}

// POST /api/profiles/
profiles.post("/", (c) => createOrUpdate(c, null, false));

// GET /api/profiles/self/ — teen redacted self-read (before /:pk/ so the
// static path wins unambiguously)
profiles.get("/self/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  if (!scope.teen) return forbidden(c, "Only available to teen-delegated sessions.");
  if (!scope.profile) return c.json({ detail: "Not found." }, 404);
  return c.json(ownProfileRow({ ...scope.profile, photo_url: await photoUrl(r, scope.profile.photo_filename) }));
});

async function getOwned(c: TC, r: ReturnType<typeof routeCtx>) {
  const raw = (c.req.param("pk") ?? "");
  const row = await findByUuidOrId<ProfileRow>(r.env.DB, "bots_profile", "profile_id", raw);
  if (!row) return { error: c.json({ detail: "Not found." }, 404) as Response };
  if (row.user_id !== r.user.id || row.deleted_at !== null) return { error: c.json({ detail: "Not found." }, 404) as Response };
  return { row };
}

// GET /api/profiles/:pk/
profiles.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
  const found = await getOwned(c, r);
  if ("error" in found) return found.error;
  return c.json(await serializeProfile(r, found.row));
});

// PUT/PATCH /api/profiles/:pk/
profiles.put("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
  const found = await getOwned(c, r);
  if ("error" in found) return found.error;
  return createOrUpdate(c, found.row, false);
});
profiles.patch("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
  const found = await getOwned(c, r);
  if ("error" in found) return found.error;
  return createOrUpdate(c, found.row, true);
});

// DELETE /api/profiles/:pk/ — hard delete with CASCADE (Django parity:
// Profile has no custom delete(), so DRF destroy() deletes the row and
// the DB cascades chats, decks, pages, and reviews).
profiles.delete("/:pk/", async (c) => {
  const r = routeCtx(c);
  if ((await teenScope(r)).teen) return forbidden(c, "Only available to parent sessions.");
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");
  const found = await getOwned(c, r);
  if ("error" in found) return found.error;
  await run(r.env.DB, "DELETE FROM bots_profile WHERE id = ?", found.row.id);
  return c.body(null, 204);
});

export default profiles;
