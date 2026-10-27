// Auth: password + refresh (SimpleJWT-compatible), login, OAuth web flow.
// Port of TokenObtainPair/Refresh, get_jwt, start_web_login, auto_login.

import { Hono } from "hono";
import { authenticate, isTeenDelegated, mintSession, verifySession } from "../auth";
import { first, run } from "../db";
import { verifyDjangoHash } from "../crypto";
import { newUuid } from "../crypto";
import { nowIso, type Env } from "../types";
import {
  appleAuthorizeUrl,
  exchangeAppleCode,
  exchangeGoogleCode,
  findOrCreateUser,
  googleAuthorizeUrl,
  verifyAppleIdToken,
  verifyGoogleIdToken,
} from "../oauth";
import { routeCtx, type TC, makeRouter } from "./helpers";

const auth = makeRouter();

// POST /api/token/ — username/password (SimpleJWT TokenObtainPair shape)
auth.post("/token/", async (c) => {
  const env = c.env as Env;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof body?.["username"] === "string" ? body["username"] : "";
  const password = typeof body?.["password"] === "string" ? body["password"] : "";
  if (!username || !password) return c.json({ detail: "No active account found with the given credentials" }, 401);
  const user = await first<{ id: number; password: string; is_active: number }>(
    env.DB,
    "SELECT id, password, is_active FROM auth_user WHERE username = ?",
    username,
  );
  if (!user || user.is_active !== 1) return c.json({ detail: "No active account found with the given credentials" }, 401);
  if (!(await verifyDjangoHash(password, user.password))) {
    return c.json({ detail: "No active account found with the given credentials" }, 401);
  }
  await run(env.DB, "UPDATE auth_user SET last_login = ? WHERE id = ?", nowIso(), user.id);
  const tokens = await mintSession(env, user.id);
  return c.json(tokens);
});

// POST /api/token/refresh/ — {refresh} -> {access, refresh?}
auth.post("/token/refresh/", async (c) => {
  const env = c.env as Env;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const refresh = typeof body?.["refresh"] === "string" ? (body["refresh"] as string) : "";
  if (!refresh) return c.json({ detail: "Token is invalid or expired" }, 401);
  const sess = await verifySession(env, refresh);
  if (!sess || sess.auth.token_type !== "refresh") return c.json({ detail: "Token is invalid or expired" }, 401);
  const tokens = await mintSession(
    env,
    sess.user.id,
    sess.auth.is_teen_delegated && sess.auth.active_profile_id
      ? { active_profile_id: sess.auth.active_profile_id }
      : undefined,
  );
  // SimpleJWT (ROTATE=False) answers {access}; returning the refresh too is
  // harmless and keeps native clients that replace the pair working.
  return c.json({ access: tokens.access, refresh: tokens.refresh });
});

async function delegatedOrParentTokens(env: Env, userId: number, email: string) {
  const teenProfile = await first<{ id: number; user_id: number; profile_id: string }>(
    env.DB,
    "SELECT id, user_id, profile_id FROM bots_profile WHERE LOWER(oauth_email) = LOWER(?) AND oauth_email IS NOT NULL AND deleted_at IS NULL AND user_id != ? ORDER BY id ASC",
    email,
    userId,
  );
  if (teenProfile) {
    const tokens = await mintSession(env, teenProfile.user_id, { active_profile_id: teenProfile.profile_id });
    return { ...tokens, active_profile_id: teenProfile.profile_id, is_teen_delegated: true as const };
  }
  return await mintSession(env, userId);
}

// GET /api/login — Bearer session -> token pair (teen-aware), like get_jwt.
auth.get("/login", authenticate, async (c) => {
  const r = routeCtx(c);
  const data = await delegatedOrParentTokens(r.env, r.user.id, r.user.email);
  const isTeen = (data as Record<string, unknown>)["is_teen_delegated"] === true;
  if (c.req.query("json") !== undefined) return c.json(data);
  const params = new URLSearchParams({
    access: (data as Record<string, unknown>)["access"] as string,
    refresh: (data as Record<string, unknown>)["refresh"] as string,
    active_profile_id: (data as Record<string, unknown>)["active_profile_id"] as string ?? "",
    is_teen_delegated: String(isTeen).toLowerCase(),
  });
  const cookies = c.req.header("cookie") ?? "";
  if (cookies.includes("from-web=true")) {
    const webUrl = r.env.WEB_APP_LOGIN_URL ?? "https://syftlearning.app/app/login";
    const resp = c.redirect(`${webUrl}?${params.toString()}`, 302);
    resp.headers.append("Set-Cookie", "from-web=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return resp;
  }
  const deepUrl = r.env.APP_DEEP_URL ?? "syftlearning://login";
  return c.redirect(`${deepUrl}?${params.toString()}`, 302);
});

// GET /api/login/web?provider= — set from-web cookie, redirect to auto-login
auth.get("/login/web", async (c) => {
  const provider = c.req.query("provider");
  const loginPath = provider === "apple" ? "/api/accounts/apple/auto-login/" : "/api/accounts/google/auto-login/";
  const resp = c.redirect(loginPath, 302);
  resp.headers.append("Set-Cookie", "from-web=true; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure");
  return resp;
});

async function beginOAuth(c: TC, provider: "google" | "apple") {
  const env = c.env;
  const state = newUuid().replace(/-/g, "");
  await run(env.DB, "INSERT INTO oauth_state (state, provider, created_at) VALUES (?, ?, ?)", state, provider, nowIso());
  const url = provider === "google" ? googleAuthorizeUrl(env, c.req.url, state) : appleAuthorizeUrl(env, c.req.url, state);
  return c.redirect(url, 302);
}

// GET /api/accounts/google|apple/auto-login/ — bridge into the provider flow
auth.get("/accounts/google/auto-login/", async (c) => beginOAuth(c, "google"));
auth.get("/accounts/apple/auto-login/", async (c) => beginOAuth(c, "apple"));

async function finishOAuth(c: TC, provider: "google" | "apple") {
  const env = c.env;
  const url = new URL(c.req.url);
  let code = url.searchParams.get("code") ?? "";
  let state = url.searchParams.get("state") ?? "";
  if (c.req.header("content-type")?.includes("application/x-www-form-urlencoded")) {
    const form = (await c.req.parseBody()) as Record<string, unknown>;
    if (typeof form["code"] === "string") code = form["code"] as string;
    if (typeof form["state"] === "string") state = form["state"] as string;
  }
  if (!code) return c.json({ detail: "Missing authorization code." }, 400);
  if (!state) return c.json({ detail: "Missing state." }, 400);
  const saved = await first<{ state: string }>(env.DB, "SELECT state FROM oauth_state WHERE state = ? AND provider = ?", state, provider);
  if (!saved) return c.json({ detail: "Invalid state." }, 400);
  await run(env.DB, "DELETE FROM oauth_state WHERE state = ?", state);

  const exchanged = provider === "google" ? await exchangeGoogleCode(env, c.req.url, code) : await exchangeAppleCode(env, c.req.url, code);
  if (!exchanged) return c.json({ detail: "Token exchange failed." }, 400);
  const verified =
    provider === "google"
      ? await verifyGoogleIdToken(env, exchanged.idToken)
      : await verifyAppleIdToken(env, exchanged.idToken);
  if (!verified || !verified.sub) return c.json({ detail: "Invalid identity token." }, 400);
  const account = await findOrCreateUser(env.DB, provider, verified.sub, verified.email, verified.firstName);
  const data = await delegatedOrParentTokens(env, account.id, account.email);
  const params = new URLSearchParams({
    access: (data as Record<string, unknown>)["access"] as string,
    refresh: (data as Record<string, unknown>)["refresh"] as string,
    active_profile_id: ((data as Record<string, unknown>)["active_profile_id"] as string) ?? "",
    is_teen_delegated: String((data as Record<string, unknown>)["is_teen_delegated"] === true).toLowerCase(),
  });
  const cookies = c.req.header("cookie") ?? "";
  if (cookies.includes("from-web=true")) {
    const webUrl = env.WEB_APP_LOGIN_URL ?? "https://syftlearning.app/app/login";
    const resp = c.redirect(`${webUrl}?${params.toString()}`, 302);
    resp.headers.append("Set-Cookie", "from-web=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return resp;
  }
  const deepUrl = env.APP_DEEP_URL ?? "syftlearning://login";
  return c.redirect(`${deepUrl}?${params.toString()}`, 302);
}

auth.get("/auth/google/callback", async (c) => finishOAuth(c, "google"));
auth.post("/auth/google/callback", async (c) => finishOAuth(c, "google"));
auth.get("/auth/apple/callback", async (c) => finishOAuth(c, "apple"));
auth.post("/auth/apple/callback", async (c) => finishOAuth(c, "apple"));

// POST /api/auth/google — native clients: {id_token} -> token pair (JSON)
auth.post("/auth/google", async (c) => {
  const env = c.env as Env;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const idToken = typeof body?.["id_token"] === "string" ? (body["id_token"] as string) : "";
  if (!idToken) return c.json({ detail: "id_token is required." }, 400);
  const verified = await verifyGoogleIdToken(env, idToken);
  if (!verified || !verified.sub) return c.json({ detail: "Invalid identity token." }, 400);
  const account = await findOrCreateUser(env.DB, "google", verified.sub, verified.email, verified.firstName);
  return c.json(await delegatedOrParentTokens(env, account.id, account.email));
});

// POST /api/auth/apple — native clients: {identity_token} -> token pair (JSON)
auth.post("/auth/apple", async (c) => {
  const env = c.env as Env;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const idToken = typeof body?.["identity_token"] === "string" ? (body["identity_token"] as string) : "";
  if (!idToken) return c.json({ detail: "identity_token is required." }, 400);
  const verified = await verifyAppleIdToken(env, idToken);
  if (!verified || !verified.sub) return c.json({ detail: "Invalid identity token." }, 400);
  const account = await findOrCreateUser(env.DB, "apple", verified.sub, verified.email, verified.firstName);
  return c.json(await delegatedOrParentTokens(env, account.id, account.email));
});

void isTeenDelegated;
export default auth;
