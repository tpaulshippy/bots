// Auth: SimpleJWT-compatible HS256 sessions, teen delegation, parent reauth.
//
// Token shapes mirror back/bots/tokens.py + parent_reauth.py:
//   access  (1h)   {token_type access, user_id, is_teen_delegated?, active_profile_id?}
//   refresh (31d)  {token_type refresh, user_id, ...same delegation claims}
//   parent  (15m)  {token_type access, user_id, parent_reauth: true} via X-Parent-Reauth
// JWT_SECRET must equal Django SECRET_KEY for cross-cutover validity.

import type { Context, Next } from "hono";
import type { TC } from "./routes/helpers";
import { newUuid, randomToken, signJwt, verifyJwt } from "./crypto";
import { first } from "./db";
import type { AuthPayload, AuthUser, Env, ProfileRow } from "./types";

export const ACCESS_LIFETIME_S = 3600;
export const REFRESH_LIFETIME_S = 31 * 24 * 3600;
export const PARENT_REAUTH_LIFETIME_S = 15 * 60;

export function jwtSecret(env: Env): string {
  return env.JWT_SECRET ?? "test-secret-key-for-development-only";
}

function baseClaims(userId: number, tokenType: "access" | "refresh", lifetimeS: number, extra?: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    token_type: tokenType,
    user_id: userId,
    iat: now,
    exp: now + lifetimeS,
    jti: newUuid(),
    ...(extra ?? {}),
  };
}

export async function mintSession(
  env: Env,
  userId: number,
  delegated?: { active_profile_id: string },
): Promise<{ access: string; refresh: string }> {
  const secret = jwtSecret(env);
  const extra = delegated ? { is_teen_delegated: true, active_profile_id: delegated.active_profile_id } : {};
  const [access, refresh] = await Promise.all([
    signJwt(baseClaims(userId, "access", ACCESS_LIFETIME_S, extra), secret),
    signJwt(baseClaims(userId, "refresh", REFRESH_LIFETIME_S, extra), secret),
  ]);
  return { access, refresh };
}

export async function mintParentSessionToken(env: Env, userId: number): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + PARENT_REAUTH_LIFETIME_S;
  const token = await signJwt({ token_type: "access", user_id: userId, iat: Math.floor(Date.now() / 1000), exp, jti: newUuid(), parent_reauth: true }, jwtSecret(env));
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

// Verify any HS256 token and normalize to AuthPayload. Returns null when the
// signature/expiry is bad or the user no longer exists/is inactive.
export async function verifySession(env: Env, token: string): Promise<{ user: AuthUser; auth: AuthPayload } | null> {
  const payload = await verifyJwt(token, jwtSecret(env));
  if (!payload) return null;
  const userId = payload["user_id"];
  if (typeof userId !== "number") return null;
  const user = await first<AuthUser>(env.DB, "SELECT id, email, username, is_active FROM auth_user WHERE id = ?", userId);
  if (!user || user.is_active !== 1) return null;
  return {
    user,
    auth: {
      user_id: userId,
      token_type: payload["token_type"] === "refresh" ? "refresh" : "access",
      exp: payload["exp"] as number,
      iat: payload["iat"] as number,
      jti: typeof payload["jti"] === "string" ? (payload["jti"] as string) : undefined,
      is_teen_delegated: payload["is_teen_delegated"] === true,
      active_profile_id: typeof payload["active_profile_id"] === "string" ? (payload["active_profile_id"] as string) : null,
      parent_reauth: payload["parent_reauth"] === true,
    },
  };
}

export const isTeenDelegated = (auth: AuthPayload | null): boolean => auth?.is_teen_delegated === true;

// Port of bots/tokens.py delegated_profile_from_auth: the claimed profile,
// or null for parent sessions / stale claims. Scoped to the token's user.
export async function delegatedProfile(env: Env, auth: AuthPayload, userId: number): Promise<ProfileRow | null> {
  if (!isTeenDelegated(auth) || !auth.active_profile_id) return null;
  return await first<ProfileRow>(
    env.DB,
    "SELECT * FROM bots_profile WHERE profile_id = ? AND deleted_at IS NULL AND user_id = ?",
    auth.active_profile_id,
    userId,
  );
}

// Port of has_valid_parent_reauth: X-Parent-Reauth must be a live
// parent_reauth token for this user. Teen sessions can never satisfy it.
export async function hasValidParentReauth(env: Env, c: TC): Promise<boolean> {
  const header = c.req.header("X-Parent-Reauth");
  if (!header) return false;
  const payload = await verifyJwt(header, jwtSecret(env));
  if (!payload || payload["parent_reauth"] !== true) return false;
  const sess = await verifySession(env, header);
  if (!sess || isTeenDelegated(sess.auth)) return false;
  const current = c.get("auth") as AuthPayload | null;
  if (current && sess.auth.user_id !== current.user_id) return false;
  return true;
}

// No PIN configured => parent writes are allowed without reauth (Django parity).
export async function parentReauthRequired(env: Env, c: TC): Promise<boolean> {
  const user = c.get("user") as AuthUser;
  const acct = await first<{ pin_hash: string | null }>(env.DB, "SELECT pin_hash FROM bots_useraccount WHERE user_id = ?", user.id);
  if (!acct?.pin_hash) return false;
  return !(await hasValidParentReauth(env, c));
}

export function unauthorized(c: TC, detail = "Authentication credentials were not provided."): Response {
  return c.json({ detail }, 401);
}

export function forbidden(c: TC, detail = "You do not have permission to perform this action."): Response {
  return c.json({ detail }, 403);
}

// Hono middleware: Bearer JWT (SimpleJWT-compatible). Sets `user` + `auth`.
// Session-cookie auth from Django is intentionally not supported: the mobile
// app only ever sends Bearer tokens, and Workers have no session store.
export async function authenticate(c: TC, next: Next): Promise<Response | void> {
  const header = c.req.header("Authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(header.trim());
  if (m) {
    const sess = await verifySession(c.env, m[1]!);
    if (sess) {
      c.set("user", sess.user);
      c.set("auth", sess.auth);
      await next();
      return;
    }
    return unauthorized(c, "Given token not valid for any token type");
  }
  return unauthorized(c);
}

// Like authenticate, but lets the route decide (used by public-with-identity
// endpoints such as html raw links).
export async function authenticateOptional(c: TC, next: Next): Promise<void> {
  const header = c.req.header("Authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(header.trim());
  if (m) {
    const sess = await verifySession(c.env, m[1]!);
    if (sess) {
      c.set("user", sess.user);
      c.set("auth", sess.auth);
    }
  }
  await next();
}

export function csrfState(): string {
  return randomToken(24);
}
