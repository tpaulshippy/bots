// Social login: Google + Apple OAuth code flow + ID-token verification.
//
// Replaces allauth's browser flow. Route contract is unchanged so the Expo
// app's login screen works as-is:
//   GET /api/login/web?provider=apple|google  -> 302 to provider authorize
//   GET /api/accounts/google|apple/auto-login/ -> 302 to provider authorize
//   <provider> callback -> find-or-create user -> 302 to APP_DEEP_URL (native)
//     or WEB_APP_LOGIN_URL (from-web cookie) with access/refresh tokens.
// Teen detection (oauth_email match) and token shapes match get_jwt.

import { b64urlDecodeJson, b64urlDecodeToBytes, b64urlEncode } from "./crypto";
import { first, run } from "./db";
import { newUuid } from "./crypto";
import { nowIso } from "./types";
import type { Env } from "./types";

export const PENELOPE_GREETING = "Hello! I'm Penelope, your writing assistant. How can I help you with writing today?";

// Idempotent default content (port of signals.provision_default_content).
export async function provisionDefaultContent(db: D1Database, userId: number, firstName: string): Promise<void> {
  const now = nowIso();
  // Account row FIRST: the starter-chat INSERT below fires the chat_count
  // trigger, which updates no row if the account doesn't exist yet (drift
  // that never self-corrects - every new OAuth user hit this).
  const acct = await first<{ id: number }>(db, "SELECT id FROM bots_useraccount WHERE user_id = ?", userId);
  if (!acct) {
    await run(db, "INSERT INTO bots_useraccount (user_id) VALUES (?)", userId);
  }
  let profile = await first<{ id: number }>(
    db,
    "SELECT id FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
    userId,
  );
  if (!profile) {
    await run(
      db,
      "INSERT INTO bots_profile (user_id, profile_id, name, created_at, modified_at) VALUES (?, ?, ?, ?, ?)",
      userId,
      newUuid(),
      firstName || "Student",
      now,
      now,
    );
    profile = await first<{ id: number }>(
      db,
      "SELECT id FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
      userId,
    );
  }
  let bot = await first<{ id: number }>(
    db,
    "SELECT id FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
    userId,
  );
  if (!bot) {
    const defModel = await first<{ id: number }>(db, "SELECT id FROM bots_aimodel WHERE is_default = 1");
    if (defModel) {
      await run(
        db,
        "INSERT INTO bots_bot (user_id, ai_model_id, bot_id, name, template_name, system_prompt, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        userId,
        defModel.id,
        newUuid(),
        "Penelope",
        "Blank",
        "",
        now,
        now,
      );
      bot = await first<{ id: number }>(
        db,
        "SELECT id FROM bots_bot WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC",
        userId,
      );
    }
  }
  const chatCount = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bots_chat WHERE user_id = ?", userId);
  if ((chatCount?.n ?? 0) === 0 && profile) {
    await run(
      db,
      "INSERT INTO bots_chat (user_id, profile_id, bot_id, chat_id, title, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      userId,
      profile.id,
      bot?.id ?? null,
      newUuid(),
      "Can you help with writing?",
      now,
      now,
    );
    const chat = await first<{ id: number }>(
      db,
      "SELECT id FROM bots_chat WHERE user_id = ? ORDER BY id DESC",
      userId,
    );
    if (chat) {
      await run(
        db,
        "INSERT INTO bots_message (chat_id, message_id, text, role, \"order\", created_at, modified_at) VALUES (?, ?, ?, 'assistant', 0, ?, ?)",
        chat.id,
        newUuid(),
        PENELOPE_GREETING,
        now,
        now,
      );
    }
  }
}

export async function findOrCreateUser(
  db: D1Database,
  provider: string,
  subject: string,
  email: string,
  firstName: string,
): Promise<{ id: number; email: string } | null> {
  const linked = await first<{ user_id: number }>(
    db,
    "SELECT user_id FROM oauth_account WHERE provider = ? AND subject = ?",
    provider,
    subject,
  );
  if (linked) {
    const u = await first<{ id: number; email: string; is_active: number }>(
      db,
      "SELECT id, email, is_active FROM auth_user WHERE id = ?",
      linked.user_id,
    );
    // Deactivated accounts stay dead: never link or mint for them.
    if (u && u.is_active === 1) return { id: u.id, email: u.email };
    if (u) return null;
  }
  const normalized = (email ?? "").toLowerCase().trim();
  // Never link on an empty email: unrelated subject-only logins would
  // otherwise merge into one account.
  let user: { id: number; email: string; is_active: number } | null = normalized
    ? await first<{ id: number; email: string; is_active: number }>(
        db,
        "SELECT id, email, is_active FROM auth_user WHERE LOWER(email) = ? AND is_active = 1 ORDER BY id ASC",
        normalized,
      )
    : null;
  if (!user) {
    const base = (normalized.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "") || "user";
    let username = base;
    for (let i = 0; i < 25; i++) {
      const taken = await first<{ id: number }>(db, "SELECT id FROM auth_user WHERE username = ?", username);
      if (!taken) break;
      username = `${base}${Math.floor(Math.random() * 1e6)}`;
    }
    const now = nowIso();
    const res = await run(
      db,
      "INSERT INTO auth_user (password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined) VALUES (?, ?, 0, ?, ?, '', ?, 0, 1, ?)",
      `!unusable-${newUuid()}`,
      null,
      username,
      firstName ?? "",
      normalized,
      now,
    );
    user = { id: Number(res.meta.last_row_id), email: normalized, is_active: 1 };
    await provisionDefaultContent(db, user.id, firstName ?? "");
  }
  if (!user) return null;
  await run(
    db,
    "INSERT OR IGNORE INTO oauth_account (user_id, provider, subject, email, created_at) VALUES (?, ?, ?, ?, ?)",
    user!.id,
    provider,
    subject,
    normalized,
    nowIso(),
  );
  return { id: user!.id, email: user!.email };
}

// --- JWT signature verification (RS256, JWKS) -------------------------------

interface JwkKey {
  kid?: string;
  kty?: string;
  use?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

async function verifyRs256(jwt: string, jwksUri: string): Promise<Record<string, unknown> | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  let header: { kid?: string; alg?: string };
  try {
    header = b64urlDecodeJson(parts[0]!);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const resp = await fetch(jwksUri);
  if (!resp.ok) return null;
  const jwks = (await resp.json()) as { keys?: JwkKey[] };
  const keys = (jwks.keys ?? []).filter((k) => !header.kid || k.kid === header.kid);
  const signingInput = `${parts[0]}.${parts[1]}`;
  let sig: Uint8Array;
  try {
    sig = b64urlDecodeToBytes(parts[2]!);
  } catch {
    return null;
  }
  const data = new TextEncoder().encode(signingInput);
  for (const key of keys) {
    try {
      const ck = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true } as unknown as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", ck, sig, data)) {
        return b64urlDecodeJson(parts[1]!);
      }
    } catch {
      // try next key
    }
  }
  return null;
}

function tokenExpiryOk(payload: Record<string, unknown>): boolean {
  // exp is mandatory: a token without (numeric, future) expiry is rejected.
  return typeof payload["exp"] === "number" && payload["exp"] * 1000 > Date.now();
}

export async function verifyGoogleIdToken(env: Env, idToken: string): Promise<{ sub: string; email: string; firstName: string } | null> {
  const payload = await verifyRs256(idToken, "https://www.googleapis.com/oauth2/v3/certs");
  if (!payload) return null;
  const iss = payload["iss"];
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") return null;
  if (!tokenExpiryOk(payload)) return null;
  const aud = env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const tokenAud = payload["aud"];
  const audOk = Array.isArray(tokenAud) ? tokenAud.includes(aud) : tokenAud === aud;
  if (!audOk || typeof payload["sub"] !== "string") return null;
  // Django parity (ACCOUNT_EMAIL_VERIFICATION='none'): presence, not
  // provider-verified status, is what matters.
  if (typeof payload["email"] !== "string" || !payload["email"]) return null;
  return { sub: payload["sub"] as string, email: payload["email"], firstName: String(payload["given_name"] ?? "") };
}

export async function verifyAppleIdToken(env: Env, idToken: string): Promise<{ sub: string; email: string; firstName: string } | null> {
  const payload = await verifyRs256(idToken, "https://appleid.apple.com/auth/keys");
  if (!payload) return null;
  if (payload["iss"] !== "https://appleid.apple.com") return null;
  if (!tokenExpiryOk(payload)) return null;
  if (payload["aud"] !== env.APPLE_CLIENT_ID || typeof payload["sub"] !== "string") return null;
  // Django parity (ACCOUNT_EMAIL_VERIFICATION='none'): presence, not
  // provider-verified status, is what matters.
  if (typeof payload["email"] !== "string" || !payload["email"]) return null;
  return { sub: payload["sub"] as string, email: payload["email"], firstName: "" };
}

// --- OAuth code flows -------------------------------------------------------

function callbackUrl(reqUrl: string, provider: string): string {
  const u = new URL(reqUrl);
  return `${u.origin}/api/auth/${provider}/callback`;
}

export function googleAuthorizeUrl(env: Env, reqUrl: string, state: string): string {
  const cb = callbackUrl(reqUrl, "google");
  const q = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: cb,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export function appleAuthorizeUrl(env: Env, reqUrl: string, state: string): string {
  const cb = callbackUrl(reqUrl, "apple");
  const q = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID ?? "",
    redirect_uri: cb,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${q.toString()}`;
}

export async function exchangeGoogleCode(env: Env, reqUrl: string, code: string): Promise<{ idToken: string } | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl(reqUrl, "google"),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id_token?: string };
  if (!body.id_token) return null;
  return { idToken: body.id_token };
}

function pemToBytes(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Apple client_secret: ES256 JWT signed with the .p8 private key.
export async function appleClientSecret(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID }));
  const body = b64urlEncode(
    JSON.stringify({
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 86400 * 150,
      aud: "https://appleid.apple.com",
      sub: env.APPLE_CLIENT_ID,
    }),
  );
  const keyBytes = pemToBytes(env.APPLE_PRIVATE_KEY ?? "");
  const key = await crypto.subtle.importKey("pkcs8", keyBytes.buffer as unknown as ArrayBuffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${b64urlEncode(sig)}`;
}

export async function exchangeAppleCode(env: Env, reqUrl: string, code: string): Promise<{ idToken: string } | null> {
  const clientSecret = await appleClientSecret(env);
  const resp = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID ?? "",
      client_secret: clientSecret,
      redirect_uri: callbackUrl(reqUrl, "apple"),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { id_token?: string };
  if (!body.id_token) return null;
  return { idToken: body.id_token };
}
