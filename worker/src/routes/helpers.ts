// Shared route helpers: teen scoping, UUID-or-id lookup, serial context.

import { Hono } from "hono";
import type { Context } from "hono";
import { delegatedProfile, forbidden, isTeenDelegated, unauthorized } from "../auth";
import { first, fromBool } from "../db";
import { signMediaUrl } from "../images";
import type { AuthPayload, AuthUser, Env, ProfileRow } from "../types";

export interface AppVars {
  user: AuthUser;
  auth: AuthPayload;
}

export type AppEnv = { Bindings: Env; Variables: AppVars };
export type TC = Context<AppEnv>;
export const makeRouter = (): Hono<AppEnv> => new Hono<AppEnv>();

export interface RouteCtx {
  env: Env;
  base: string; // request origin + /api
  user: AuthUser;
  auth: AuthPayload;
}

export function routeCtx(c: TC): RouteCtx {
  const origin = new URL(c.req.url).origin;
  return {
    env: c.env,
    base: `${origin}/api`,
    user: c.get("user"),
    auth: c.get("auth"),
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v);

export async function findByUuidOrId<T>(
  db: D1Database,
  table: string,
  uuidCol: string,
  raw: string,
): Promise<T | null> {
  if (isUuid(raw)) {
    return await first<T>(db, `SELECT * FROM ${table} WHERE ${uuidCol} = ?`, raw.toLowerCase());
  }
  if (/^\d+$/.test(raw)) {
    return await first<T>(db, `SELECT * FROM ${table} WHERE id = ?`, parseInt(raw, 10));
  }
  return null;
}

export interface TeenScope {
  teen: boolean;
  profile: ProfileRow | null;
}

// Teen sessions are locked to their claimed profile (claim enforced, client
// profileId ignored). Returns {teen:true, profile:null} when the claim is
// stale — list endpoints serve empty, detail endpoints 403/404.
export async function teenScope(r: RouteCtx): Promise<TeenScope> {
  if (!isTeenDelegated(r.auth)) return { teen: false, profile: null };
  const profile = await delegatedProfile(r.env, r.auth, r.user.id);
  return { teen: true, profile };
}

export async function photoUrl(r: RouteCtx, filename: string | null): Promise<string | null> {
  if (!filename) return null;
  const origin = r.base.replace(/\/api$/, "");
  return await signMediaUrl(r.env, filename, origin);
}

export { forbidden, unauthorized, fromBool };
