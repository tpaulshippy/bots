// RevenueCat webhook — port of bots/views/revenuecat_webhook.py.
// Shared-secret auth; persists the raw event; maps entitlements to levels.

import { makeRouter } from "./helpers";
import { first, run } from "../db";
import { newUuid } from "../crypto";
import { nowIso, type Env } from "../types";

const revenuecat = makeRouter();

const VALID_TYPES = new Set([
  "INITIAL_PURCHASE",
  "PRODUCT_CHANGE",
  "RENEWAL",
  "CANCELLATION",
  "EXPIRATION",
  "TEST",
]);

// POST /api/revenuecat/webhook
revenuecat.post("/webhook", async (c) => {
  const env = c.env as Env;
  const expected = env.REVENUECAT_WEBHOOK_AUTH_HEADER ?? "";
  if (!expected || c.req.header("Authorization") !== expected) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  // Persist every parsed body before validating (Django parity): rejected
  // webhooks are still recorded for debugging.
  const now = nowIso();
  await run(env.DB, "INSERT INTO bots_revenuecatwebhookevent (raw_event, created_at, updated_at) VALUES (?, ?, ?)", JSON.stringify(body), now, now);
  const event = body["event"] as Record<string, unknown> | undefined;
  if (!event || typeof event["type"] !== "string" || !VALID_TYPES.has(event["type"] as string)) {
    return c.json({ detail: "Invalid event type." }, 400);
  }
  const appUserId = event["app_user_id"];
  const appUserIdNum = typeof appUserId === "string" ? parseInt(appUserId, 10) : typeof appUserId === "number" ? appUserId : NaN;
  if (!Number.isFinite(appUserIdNum)) return c.json({ detail: "User not found." }, 404);
  const user = await first<{ id: number }>(env.DB, "SELECT id FROM auth_user WHERE id = ?", appUserIdNum);
  if (!user) return c.json({ detail: "User not found." }, 404);

  const entitlementIds = event["entitlement_ids"];
  const ids = Array.isArray(entitlementIds) ? entitlementIds.map(String) : [];
  const level = ids.includes("plus") ? 2 : ids.includes("basic") ? 1 : 0;
  await run(env.DB, "UPDATE bots_useraccount SET subscription_level = ? WHERE user_id = ?", level, user.id);
  return c.json({ status: "success" });
});

export default revenuecat;
