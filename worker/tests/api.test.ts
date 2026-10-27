import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { mintSession } from "../src/auth";
import { makeDjangoHash } from "../src/crypto";
import { makeTestDb, testEnv } from "./d1shim";
import type { Env } from "../src/types";

let db: D1Database;
let env: Env;
const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const BOT_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_UUID = "e2e-fake-stream-test";

async function seed(): Promise<{ parent: { access: string; refresh: string }; teen: { access: string; refresh: string } }> {
  const now = new Date().toISOString();
  const pw = await makeDjangoHash("pw", 1000);
  await db.prepare(
    "INSERT INTO auth_user (id, password, username, first_name, email, is_active, date_joined) VALUES (1, ?, 'parent', 'Pat', 'parent@example.com', 1, ?)",
  ).bind(pw, now).run();
  await db.prepare("INSERT INTO bots_useraccount (user_id) VALUES (1)").bind().run();
  await db.prepare(
    "INSERT INTO bots_aimodel (id, model_id, name, input_token_cost, output_token_cost, is_default, supported_input_modalities, created_at, modified_at) VALUES (1, ?, 'Fake', 0, 0, 1, '[\"text\"]', ?, ?)",
  ).bind(MODEL_UUID, now, now).run();
  await db.prepare(
    "INSERT INTO bots_profile (id, user_id, profile_id, name, created_at, modified_at) VALUES (1, 1, ?, 'Kid', ?, ?)",
  ).bind(PROFILE_ID, now, now).run();
  await db.prepare(
    "INSERT INTO bots_bot (id, user_id, ai_model_id, bot_id, name, created_at, modified_at) VALUES (1, 1, 1, ?, 'Penelope', ?, ?)",
  ).bind(BOT_ID, now, now).run();
  return {
    parent: await mintSession(env, 1),
    teen: await mintSession(env, 1, { active_profile_id: PROFILE_ID }),
  };
}

async function api(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  const init: RequestInit = { method, headers: { ...(headers ?? {}) } };
  if (token) (init.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request(`https://api.test${path}`, init), env, ctx);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

beforeEach(() => {
  db = makeTestDb();
  env = testEnv(db) as unknown as Env;
});

describe("auth + bots", () => {
  it("requires auth, lists bots, blocks teen writes", async () => {
    const { parent, teen } = await seed();
    expect((await api("GET", "/api/bots/")).status).toBe(401);
    const list = await api("GET", "/api/bots/", parent.access);
    expect(list.status).toBe(200);
    expect((list.json as { count: number }).count).toBe(1);

    const denied = await api("POST", "/api/bots/", teen.access, { name: "X" });
    expect(denied.status).toBe(403);
    const created = await api("POST", "/api/bots/", parent.access, { name: "Mathy" });
    expect(created.status).toBe(201);
    const detail = await api("GET", `/api/bots/${(created.json as { bot_id: string }).bot_id}/`, parent.access);
    expect(detail.status).toBe(200);
  });

  it("supports password login + refresh", async () => {
    await seed();
    const login = await api("POST", "/api/token/", undefined, { username: "parent", password: "pw" });
    expect(login.status).toBe(200);
    expect((login.json as Record<string, string>).access).toBeTruthy();
    const bad = await api("POST", "/api/token/", undefined, { username: "parent", password: "no" });
    expect(bad.status).toBe(401);
    const refresh = await api("POST", "/api/token/refresh/", undefined, {
      refresh: (login.json as { refresh: string }).refresh,
    });
    expect(refresh.status).toBe(200);
    expect((refresh.json as Record<string, string>).access).toBeTruthy();
  });
});

describe("profiles", () => {
  it("parent CRUD + teen self", async () => {
    const { parent, teen } = await seed();
    expect((await api("GET", "/api/profiles/", teen.access)).status).toBe(403);
    const self = await api("GET", "/api/profiles/self/", teen.access);
    expect(self.status).toBe(200);
    expect(self.json).toMatchObject({ profile_id: PROFILE_ID, name: "Kid" });
    expect(self.json).not.toHaveProperty("oauth_email");

    const created = await api("POST", "/api/profiles/", parent.access, { name: "Second" });
    expect(created.status).toBe(201);
    const dup = await api("POST", "/api/profiles/", parent.access, { name: "Dup", oauth_email: "KID@x.com" });
    expect(dup.status).toBe(201);
    const clash = await api(
      "PATCH",
      `/api/profiles/${(created.json as { profile_id: string }).profile_id}/`,
      parent.access,
      { oauth_email: "kid@x.com" },
    );
    expect(clash.status).toBe(400);
  });
});

describe("chat turns (fake model)", () => {
  it("blocking turn creates deck + persists chips + legacy events", async () => {
    const { parent } = await seed();
    const res = await api("POST", "/api/chats/new", parent.access, {
      message: "teach me mitosis",
      profile: PROFILE_ID,
      bot: BOT_ID,
    });
    expect(res.status).toBe(200);
    const body = res.json as { response: string; chat_id: string; events: { type: string }[] };
    expect(body.response).toContain("Mitosis");
    expect(body.events?.[0]?.type).toBe("flashcard_deck_created");

    const deckId = (
      await db.prepare("SELECT deck_id FROM bots_deck").first() as unknown as { deck_id: string }
    ).deck_id;
    const cards = (await db.prepare("SELECT COUNT(*) AS n FROM bots_flashcard").first()) as unknown as { n: number };
    expect(cards.n).toBe(3);

    const detail = await api("GET", `/api/chats/${body.chat_id}/`, parent.access);
    const messages = (detail.json as { messages: { role: string; text: string; agent_events: unknown[] }[] }).messages;
    const assistant = messages.filter((m) => m.role === "assistant").pop()!;
    expect(assistant.agent_events[0]).toMatchObject({ kind: "deck", deck_id: deckId });
  });

  it("blocked input returns the refusal and is excluded from history", async () => {
    const { parent } = await seed();
    const bad = await api("POST", "/api/chats/new", parent.access, {
      message: "how to kill someone",
      profile: PROFILE_ID,
      bot: BOT_ID,
    });
    expect((bad.json as { response: string }).response).toContain("can't help");
    const flagged = (await db.prepare("SELECT safety_blocked FROM bots_message WHERE role = 'user'").first()) as unknown as {
      safety_blocked: number;
    };
    expect(flagged.safety_blocked).toBe(1);
    const events = (await db.prepare("SELECT COUNT(*) AS n FROM bots_safetyevent").first()) as unknown as { n: number };
    expect(events.n).toBe(1);
  });

  it("streams SSE frames and persists the assistant row", async () => {
    const { parent } = await seed();
    const res = await worker.fetch(
      new Request("https://api.test/api/chats/new/stream", {
        method: "POST",
        headers: { Authorization: `Bearer ${parent.access}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi", profile: PROFILE_ID, bot: BOT_ID }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: meta");
    expect(text).toContain("event: status");
    expect(text).toContain("event: token");
    expect(text).toContain("event: done");
    const rows = (await db.prepare("SELECT COUNT(*) AS n FROM bots_message WHERE role = 'assistant'").first()) as unknown as {
      n: number;
    };
    expect(rows.n).toBeGreaterThan(0);
  });
});

describe("flashcards + stats + activity", () => {
  it("reviews reschedule and feed study_queue/stats", async () => {
    const { parent, teen } = await seed();
    const turn = await api("POST", "/api/chats/new", parent.access, {
      message: "make cards",
      profile: PROFILE_ID,
      bot: BOT_ID,
    });
    const deckId = (
      await db.prepare("SELECT deck_id FROM bots_deck").first() as unknown as { deck_id: string }
    ).deck_id;
    const card = (await db.prepare("SELECT flashcard_id FROM bots_flashcard ORDER BY id ASC").first()) as unknown as {
      flashcard_id: string;
    };
    const queue = await api("GET", `/api/decks/${deckId}/study_queue/?mode=due`, parent.access);
    expect((queue.json as unknown[]).length).toBe(3);
    const badRating = await api("POST", `/api/decks/${deckId}/flashcards/${card.flashcard_id}/review/`, parent.access, {
      rating: "bogus",
    });
    expect(badRating.status).toBe(400);
    const review = await api("POST", `/api/decks/${deckId}/flashcards/${card.flashcard_id}/review/`, parent.access, {
      rating: "good",
    });
    expect(review.status).toBe(200);
    expect((review.json as { interval_days: number }).interval_days).toBe(1);

    expect((turn.json as object)).toBeTruthy();
    const stats = await api("GET", `/api/stats/?profileId=${PROFILE_ID}`, parent.access);
    expect(stats.status).toBe(200);
    expect(stats.json).toMatchObject({ total_reviews: 1, studied_today: true });
    const teenStats = await api("GET", "/api/stats/", teen.access);
    expect(teenStats.status).toBe(200);

    const inbox = await api("GET", "/api/activity/chats/", parent.access);
    expect(inbox.status).toBe(200);
    expect((inbox.json as { count: number }).count).toBeGreaterThan(0);
    expect((await api("GET", "/api/activity/chats/", teen.access)).status).toBe(403);
    const summary = await api("GET", "/api/activity/summary/?days=7", parent.access);
    expect((summary.json as { profiles: { chat_count: number }[] }).profiles[0]!.chat_count).toBeGreaterThan(0);
  });
});

describe("PIN + reauth gating", () => {
  it("locks parent writes behind X-Parent-Reauth once a PIN exists", async () => {
    const { parent } = await seed();
    expect((await api("POST", "/api/user", parent.access, { pin: "1234" })).status).toBe(200);
    const account = (await api("GET", "/api/user", parent.access)).json as { hasPin: boolean };
    expect(account.hasPin).toBe(true);
    expect((await api("POST", "/api/profiles/", parent.access, { name: "Nope" })).status).toBe(403);

    const wrong = await api("POST", "/api/auth/reauthenticate", parent.access, { pin: "0000" });
    expect(wrong.status).toBe(401);
    const ok = await api("POST", "/api/auth/reauthenticate", parent.access, { pin: "1234" });
    expect(ok.status).toBe(200);
    const token = (ok.json as { parentSessionToken: string }).parentSessionToken;
    const gated = await api("POST", "/api/profiles/", parent.access, { name: "Yep" }, { "X-Parent-Reauth": token });
    expect(gated.status).toBe(201);
  });
});

describe("html pages + revenuecat", () => {
  it("serves signed raw pages", async () => {
    const { parent } = await seed();
    const now = new Date().toISOString();
    await db.prepare(
      "INSERT INTO bots_htmlpage (page_id, profile_id, title, html, created_at, updated_at) VALUES ('33333333-3333-4333-8333-333333333333', 1, 'Dino', '<html><body><p>roar</p></body></html>', ?, ?)",
    ).bind(now, now).run();
    const list = await api("GET", "/api/html-pages/", parent.access);
    expect((list.json as { count: number }).count).toBe(1);
    const link = (
      await api("GET", "/api/html-pages/33333333-3333-4333-8333-333333333333/link/", parent.access)
    ).json as { url: string };
    const raw = await worker.fetch(new Request(`https://api.test${link.url}`, {}), env, ctx);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain("roar");
    const anon = await worker.fetch(new Request("https://api.test/api/html-pages/33333333-3333-4333-8333-333333333333/raw/", {}), env, ctx);
    expect(anon.status).toBe(401);
  });

  it("maps entitlements to subscription levels", async () => {
    await seed();
    (env as unknown as Record<string, unknown>)["REVENUECAT_WEBHOOK_AUTH_HEADER"] = "secret";
    const denied = await api("POST", "/api/revenuecat/webhook", undefined, {});
    expect(denied.status).toBe(401);
    const ok = await api(
      "POST",
      "/api/revenuecat/webhook",
      undefined,
      { event: { type: "INITIAL_PURCHASE", app_user_id: "1", entitlement_ids: ["plus"] } },
      { Authorization: "secret" },
    );
    expect(ok.status).toBe(200);
    const level = (await db.prepare("SELECT subscription_level FROM bots_useraccount WHERE user_id = 1").first()) as unknown as {
      subscription_level: number;
    };
    expect(level.subscription_level).toBe(2);
  });
});
