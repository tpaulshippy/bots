// Parent account surface — port of reauthenticate.py + user_account_view.py:
// PIN lifecycle, account info, onboarding, account deletion.

import { Hono } from "hono";
import { authenticate, hasValidParentReauth, isTeenDelegated, mintParentSessionToken, parentReauthRequired } from "../auth";
import { first, run } from "../db";
import { MAX_COST_DAILY, costForToday } from "../usage";
import { nowIso, type Env } from "../types";
import { bootstrapOnboarding } from "../onboarding";
import { getPinAccount, hashPin, isPinLocked, registerPinFailure, remainingAttempts, resetPinFailures, setPinHash, validatePin, verifyPin } from "../pin";
import { KdfError } from "../crypto";
import { forbidden, makeRouter } from "./helpers";
import { routeCtx } from "./helpers";

const account = makeRouter();

const TEEN_PIN_DETAIL = "Teen-delegated sessions cannot manage the parent PIN.";

// POST /api/auth/reauthenticate — {pin} -> {parentSessionToken, expiresAt}
account.post("/auth/reauthenticate", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) {
    return c.json({ detail: "Teen-delegated sessions cannot reauthenticate as parent." }, 403);
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const pin = body?.["pin"];
  if (!validatePin(pin)) return c.json({ detail: "PIN must be a string of 4 to 8 digits." }, 400);

  const acct = await getPinAccount(r.env.DB, r.user.id);
  if (!acct || !acct.pin_hash) return c.json({ detail: "No PIN has been set for this account." }, 400);
  if (isPinLocked(acct)) return c.json({ detail: "PIN locked. Try again later.", lockedUntil: acct.pin_locked_until }, 423);
  let pinOk: boolean;
  try {
    pinOk = await verifyPin(acct.pin_hash, pin);
  } catch (e) {
    // KDF outage must not burn a PIN attempt or read as "wrong PIN".
    if (e instanceof KdfError) return c.json({ detail: "Authentication service unavailable. Please try again." }, 500);
    throw e;
  }
  if (!pinOk) {
    const updated = await registerPinFailure(r.env.DB, r.user.id);
    if (isPinLocked(updated)) {
      return c.json({ detail: "PIN locked. Try again later.", lockedUntil: updated.pin_locked_until }, 423);
    }
    return c.json({ detail: "Invalid PIN", remainingAttempts: remainingAttempts(updated) }, 401);
  }
  await resetPinFailures(r.env.DB, r.user.id);
  const { token, expiresAt } = await mintParentSessionToken(r.env, r.user.id);
  return c.json({ parentSessionToken: token, expiresAt });
});

function onboarded(acct: { onboarding_completed_at: string | null; pin_hash: string | null; user_id: number }): boolean {
  return acct.onboarding_completed_at !== null;
}

async function onboardingComplete(db: D1Database, userId: number): Promise<boolean> {
  const acct = await first<{ onboarding_completed_at: string | null }>(
    db,
    "SELECT onboarding_completed_at FROM bots_useraccount WHERE user_id = ?",
    userId,
  );
  if (!acct) return false;
  if (acct.onboarding_completed_at !== null) return true;
  const profiles = await first<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL",
    userId,
  );
  const pin = await first<{ pin_hash: string | null }>(db, "SELECT pin_hash FROM bots_useraccount WHERE user_id = ?", userId);
  if ((profiles?.n ?? 0) < 1) return false;
  if (pin?.pin_hash) return true;
  const msgs = await first<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM bots_message m JOIN bots_chat ch ON ch.id = m.chat_id WHERE ch.user_id = ? AND m.role = 'user'",
    userId,
  );
  return (msgs?.n ?? 0) > 0;
}

// GET /api/user (+?timezone=) and POST /api/user (set/change PIN)
account.get("/user", authenticate, async (c) => {
  const r = routeCtx(c);
  const tz = c.req.query("timezone");
  if (tz && typeof tz === "string" && tz.length <= 50) {
    const cur = await first<{ timezone: string }>(r.env.DB, "SELECT timezone FROM bots_useraccount WHERE user_id = ?", r.user.id);
    if (cur && cur.timezone !== tz) {
      await run(r.env.DB, "UPDATE bots_useraccount SET timezone = ? WHERE user_id = ?", tz, r.user.id);
    }
  }
  const acct = await first<{
    subscription_level: number;
    timezone: string;
    pin_hash: string | null;
    onboarding_completed_at: string | null;
  }>(
    r.env.DB,
    "SELECT subscription_level, timezone, pin_hash, onboarding_completed_at FROM bots_useraccount WHERE user_id = ?",
    r.user.id,
  );
  const cost = (await costForToday(r.env.DB, r.user.id)).total;
  const level = acct?.subscription_level ?? 0;
  const full: { onboarding_completed_at: string | null; pin_hash: string | null; user_id: number } = {
    onboarding_completed_at: acct?.onboarding_completed_at ?? null,
    pin_hash: acct?.pin_hash ?? null,
    user_id: r.user.id,
  };
  return c.json({
    userId: r.user.id,
    hasPin: !!acct?.pin_hash,
    pin: null,
    cost,
    costForToday: [cost],
    maxDailyCost: MAX_COST_DAILY[level] ?? MAX_COST_DAILY[0],
    subscriptionLevel: level,
    timezone: acct?.timezone ?? "UTC",
    onboardingCompleted: onboarded(full) || (await onboardingComplete(r.env.DB, r.user.id)),
  });
});

function coerceLegacyPin(v: unknown): unknown {
  if (typeof v === "number" && !Number.isNaN(v) && Number.isInteger(v)) return String(v);
  return v;
}

account.post("/user", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) return c.json({ detail: TEEN_PIN_DETAIL }, 403);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const pin = coerceLegacyPin(body?.["pin"]);
  const currentPin = coerceLegacyPin(body?.["currentPin"]);
  if (!validatePin(pin)) return c.json({ detail: "PIN must be a string of 4 to 8 digits." }, 400);
  const acct = await getPinAccount(r.env.DB, r.user.id);
  if (!acct) return c.json({ detail: "Account not found." }, 404);
  if (acct.pin_hash) {
    if (await parentReauthRequired(r.env, c)) {
      return c.json({ detail: "Parent reauthentication required." }, 403);
    }
    if (!validatePin(currentPin) || !(await verifyPin(acct.pin_hash, currentPin as string))) {
      return c.json({ detail: "Current PIN is incorrect." }, 403);
    }
  }
  await setPinHash(r.env.DB, r.user.id, await hashPin(pin as string));
  return c.json({ response: "ok" });
});

// POST /api/user/onboarding/complete
account.post("/user/onboarding/complete", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) return c.json({ detail: "Onboarding is completed by the parent account." }, 403);
  await run(r.env.DB, "UPDATE bots_useraccount SET onboarding_completed_at = COALESCE(onboarding_completed_at, ?) WHERE user_id = ?", nowIso(), r.user.id);
  return c.json({ response: "ok", onboardingCompleted: true });
});

// POST /api/onboarding/bootstrap
account.post("/onboarding/bootstrap", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) return c.json({ detail: "Onboarding is completed by the parent account." }, 403);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  // Changing an existing PIN requires parent reauth (first set does not) —
  // mirrors POST /api/user. Without this gate, bootstrap would be a reauth
  // bypass for anyone holding a parent session token.
  const pinParam = coerceLegacyPin(body["pin"]);
  if (typeof pinParam === "string" && pinParam !== "") {
    const existing = await getPinAccount(r.env.DB, r.user.id);
    if (existing?.pin_hash && !(await hasValidParentReauth(r.env, c))) {
      return c.json({ detail: "Parent reauthentication required." }, 403);
    }
  }
  const result = await bootstrapOnboarding(r.env.DB, r.user.id, {
    profileName: body["profileName"],
    botName: body["botName"],
    templateName: body["templateName"],
    pin: coerceLegacyPin(body["pin"]),
    systemPrompt: body["systemPrompt"],
    color: body["color"],
    icon: body["icon"],
    studentEmail: body["studentEmail"],
    profileId: body["profileId"],
    botId: body["botId"],
  });
  if ("errors" in result) return c.json(result.errors, 400);
  return c.json({ response: "ok", onboardingCompleted: true, profileId: result.profile_id, botId: result.bot_id });
});

// DELETE /api/user/pin
account.delete("/user/pin", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) return c.json({ detail: TEEN_PIN_DETAIL }, 403);
  const acct = await getPinAccount(r.env.DB, r.user.id);
  if (!acct || !acct.pin_hash) return c.json({ response: "ok" });
  if (await parentReauthRequired(r.env, c)) return c.json({ detail: "Parent reauthentication required." }, 403);
  let currentPin: unknown;
  try {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    currentPin = coerceLegacyPin(body?.["currentPin"]);
  } catch {
    currentPin = undefined;
  }
  if (!validatePin(currentPin) || !(await verifyPin(acct.pin_hash, currentPin as string))) {
    return c.json({ detail: "Current PIN is incorrect." }, 403);
  }
  await setPinHash(r.env.DB, r.user.id, null);
  return c.json({ response: "ok" });
});

// DELETE /api/user/delete
account.delete("/user/delete", authenticate, async (c) => {
  const r = routeCtx(c);
  if (isTeenDelegated(r.auth)) return c.json({ detail: "Not allowed for teen-delegated sessions." }, 403);
  if (await parentReauthRequired(r.env, c)) return forbidden(c, "Parent reauthentication required.");
  await run(r.env.DB, "DELETE FROM auth_user WHERE id = ?", r.user.id);
  return c.body(null, 204);
});

export default account;
