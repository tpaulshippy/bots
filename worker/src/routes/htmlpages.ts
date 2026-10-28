// HTML pages — port of HtmlPageViewSet. No writes except delete (agent tools
// own creation). Signed raw serving with sandboxed CSP, like Django.

import { Hono } from "hono";
import { authenticate, authenticateOptional } from "../auth";
import { isTeenDelegated, verifySession } from "../auth";
import { all, count as dbCount, first, resolvePage, paginated, run } from "../db";
import { signJwt } from "../crypto";
import { jwtSecret } from "../auth";
import { nowIso, type Env } from "../types";
import { htmlDetailRow, htmlListRow } from "../serializers";
import { findByUuidOrId, uuidMatch, routeCtx, teenScope, type TC, makeRouter } from "./helpers";

const pages = makeRouter();

const LINK_SALT = "html-page-raw";
const LINK_MAX_AGE_S = 300;

async function signPageLink(env: Env, userId: number, pageId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signJwt({ v: `${userId}:${pageId}`, salt: LINK_SALT, exp: now + LINK_MAX_AGE_S, iat: now }, jwtSecret(env));
}

async function verifyPageLink(env: Env, userId: number, pageId: string, sig: string): Promise<boolean> {
  const { verifyJwt } = await import("../crypto");
  const payload = await verifyJwt(sig, jwtSecret(env));
  return !!payload && payload["v"] === `${userId}:${pageId}` && payload["salt"] === LINK_SALT;
}

async function getOwnedPage(c: TC, r: ReturnType<typeof routeCtx>) {
  const raw = (c.req.param("pk") ?? "");
  const row = await findByUuidOrId<Record<string, unknown>>(r.env.DB, "bots_htmlpage", "page_id", raw);
  if (!row) return { error: c.json({ detail: "Unknown page" }, 404) as Response, notFound: true as const };
  const profile = await first<{ user_id: number; id: number; name: string }>(
    r.env.DB,
    "SELECT id, user_id, name FROM bots_profile WHERE id = ?",
    row["profile_id"],
  );
  const scope = await teenScope(r);
  if (scope.teen) {
    if (!scope.profile) return { error: c.json({ detail: "Unknown page" }, 404) as Response, notFound: true as const };
    if ((row["profile_id"] as number) !== scope.profile.id) return { error: c.json({ detail: "Unknown page" }, 404) as Response, notFound: true as const };
  } else if (!profile || profile.user_id !== r.user.id) {
    return { error: c.json({ detail: "Unknown page" }, 404) as Response, notFound: true as const };
  }
  return { row, profileName: profile?.name ?? null };
}

// Authenticated sub-app (list/detail/link/delete) — JWT required.
const authed = makeRouter();

// GET /api/html-pages/?profileId=
authed.get("/", authenticate, async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const profileParam = c.req.query("profileId");
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);

  let where = "h.profile_id IN (SELECT id FROM bots_profile WHERE user_id = ?)";
  const params: unknown[] = [r.user.id];
  if (scope.teen) {
    if (!scope.profile) {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/html-pages/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    where = "h.profile_id = ?";
    params.length = 0;
    params.push(scope.profile.id);
  } else if (profileParam) {
    const pmatch = uuidMatch("profile_id", profileParam);
    if (!pmatch) {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/html-pages/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    const prof = await first<{ id: number }>(r.env.DB, `SELECT id FROM bots_profile WHERE ${pmatch.sql} AND user_id = ?`, ...pmatch.params, r.user.id);
    if (!prof) {
      const rawPage = sp.get("page");
      if (rawPage !== null && rawPage !== "1" && rawPage !== "last") return c.json({ detail: "Invalid page." }, 404);
      return c.json(paginated(r.base + "/html-pages/", sp, { page: 1, pageSize: 50, limit: 50, offset: 0 }, 0, []));
    }
    where += " AND h.profile_id = ?";
    params.push(prof.id);
  }
  const total = await dbCount(r.env.DB, `SELECT COUNT(*) AS n FROM bots_htmlpage h WHERE ${where}`, ...params);
  const p = resolvePage(sp, total);
  if (!p) return c.json({ detail: "Invalid page." }, 404);
  const rows = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT h.id, h.page_id, h.title, h.created_at, h.updated_at, pr.profile_id AS profile_id_slug, pr.name AS profile_name
     FROM bots_htmlpage h JOIN bots_profile pr ON pr.id = h.profile_id
     WHERE ${where} ORDER BY h.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    p.limit,
    p.offset,
  );
  return c.json(paginated(r.base + "/html-pages/", sp, p, total, rows.map((h) => htmlListRow(h, r.base))));
});

// GET /api/html-pages/:pk/
authed.get("/:pk/", authenticate, async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedPage(c, r);
  if ("error" in found) return found.error;
  const profile = await first<{ profile_id: string; name: string }>(
    r.env.DB,
    "SELECT profile_id, name FROM bots_profile WHERE id = ?",
    found.row["profile_id"],
  );
  return c.json(htmlDetailRow({ ...found.row, profile_id_slug: profile?.profile_id ?? null, profile_name: profile?.name ?? null }));
});

// DELETE /api/html-pages/:pk/
authed.delete("/:pk/", authenticate, async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedPage(c, r);
  if ("error" in found) return found.error;
  await run(r.env.DB, "DELETE FROM bots_htmlpage WHERE id = ?", found.row["id"]);
  return c.body(null, 204);
});

// GET /api/html-pages/:pk/link/
authed.get("/:pk/link/", authenticate, async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedPage(c, r);
  if ("error" in found) return found.error;
  const sig = await signPageLink(r.env, r.user.id, found.row["page_id"] as string);
  const raw = `/api/html-pages/${found.row["page_id"]}/raw/?sig=${encodeURIComponent(sig)}`;
  return c.json({ url: raw });
});

pages.route("/", authed);

// GET /api/html-pages/:pk/raw/?sig= — public w/ owner JWT/session or ?sig=
// (Hono has no session auth; JWT bearer works like Django's session fallback.)
pages.get("/:pk/raw/", authenticateOptional, async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const rawParam = (c.req.param("pk") ?? "");
  const sig = c.req.query("sig") ?? "";
  const row = await findByUuidOrId<Record<string, unknown>>(env.DB, "bots_htmlpage", "page_id", rawParam);
  if (!row) return c.json({ detail: "Unknown page" }, 404);

  const user = c.get("user") as { id: number } | undefined;
  const auth = c.get("auth") as { is_teen_delegated?: boolean; active_profile_id?: string | null } | undefined;
  let authed2 = false;
  if (user) {
    const profile = await first<{ user_id: number; id: number }>(env.DB, "SELECT id, user_id FROM bots_profile WHERE id = ?", row["profile_id"]);
    if (profile && profile.user_id === user.id) {
      authed2 = true;
      if (auth?.is_teen_delegated) {
        // Teen sessions may only open their own profile's pages.
        const claimed = await first<{ id: number }>(
          env.DB,
          "SELECT id FROM bots_profile WHERE profile_id = ? AND deleted_at IS NULL AND user_id = ?",
          String(auth.active_profile_id ?? ""),
          user.id,
        );
        if (!claimed || claimed.id !== (row["profile_id"] as number)) {
          return c.json({ detail: "Unknown page" }, 404);
        }
      }
    } else if (sig) {
      const ownerId = profile?.user_id;
      if (ownerId && (await verifyPageLink(env, ownerId, row["page_id"] as string, sig))) authed2 = true;
    }
  } else if (sig) {
    const profile = await first<{ user_id: number }>(env.DB, "SELECT user_id FROM bots_profile WHERE id = ?", row["profile_id"]);
    if (profile && (await verifyPageLink(env, profile.user_id, row["page_id"] as string, sig))) authed2 = true;
    else return c.json({ detail: "Authentication credentials were not provided." }, 401);
  } else {
    return c.json({ detail: "Authentication credentials were not provided." }, 401);
  }
  if (!authed2) return c.json({ detail: "Unknown page" }, 404);

  return new Response(String(row["html"] ?? ""), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
});

export default pages;
