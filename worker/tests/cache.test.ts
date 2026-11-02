// Regression tests for the server caches (PR #112 review findings):
// - bot list epoch guard drops pre-write rows read mid-write
// - empty bots_aimodel is never cached (quota must enforce once priced)
import { beforeEach, describe, expect, it } from "vitest";
import {
  botListEpoch,
  clearBotListCache,
  getBotList,
  invalidateBotListCache,
  setBotList,
  type BotListEntry,
} from "../src/botListCache";
import { costForToday, invalidateModelsCache } from "../src/usage";
import { makeTestDb } from "./d1shim";
import type { BotRow } from "../src/types";

let db: D1Database;

beforeEach(() => {
  db = makeTestDb();
  invalidateModelsCache();
  clearBotListCache();
});

function botRow(partial: Partial<BotRow> = {}): BotRow {
  return {
    id: 1,
    user_id: 1,
    ai_model_id: null,
    bot_id: "22222222-2222-4222-8222-222222222222",
    name: "Penelope",
    system_prompt: null,
    simple_editor: 0,
    template_name: null,
    response_length: 200,
    restrict_language: 1,
    restrict_adult_topics: 1,
    enable_web_search: 0,
    enable_html_pages: 0,
    color: null,
    icon: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    modified_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function entry(): BotListEntry {
  return { total: 1, rows: [botRow()], models: new Map() };
}

describe("botListCache", () => {
  it("round-trips entries and invalidates per user", () => {
    setBotList("1:1", entry(), botListEpoch());
    setBotList("2:1", entry(), botListEpoch());
    expect(getBotList("1:1")?.total).toBe(1);
    invalidateBotListCache(1);
    expect(getBotList("1:1")).toBeNull();
    expect(getBotList("2:1")?.total).toBe(1);
  });

  it("drops stores from before a mid-read write (epoch guard)", () => {
    const seen = botListEpoch();
    setBotList("1:1", entry(), seen);
    expect(getBotList("1:1")?.total).toBe(1);
    // A write lands after this GET started reading: invalidate bumps epoch.
    invalidateBotListCache(1);
    // The in-flight GET's store carries the stale epoch and must be dropped.
    setBotList("1:1", entry(), seen);
    expect(getBotList("1:1")).toBeNull();
    // A fresh read after the write stores normally.
    setBotList("1:1", entry(), botListEpoch());
    expect(getBotList("1:1")?.total).toBe(1);
  });

  it("evicts oldest entries past the cap", () => {
    const seen = botListEpoch();
    for (let i = 0; i < 1005; i++) setBotList(`9:${i}`, entry(), seen);
    expect(getBotList("9:0")).toBeNull();
    expect(getBotList("9:1004")?.total).toBe(1);
  });
});

describe("pricing cache", () => {
  it("re-reads an empty model table instead of pinning costs at 0", async () => {
    const now = new Date().toISOString();
    await db.prepare(
      "INSERT INTO auth_user (id, password, username, first_name, email, is_active, date_joined) VALUES (1, 'x', 'parent', 'Pat', 'parent@example.com', 1, ?)",
    ).bind(now).run();
    await db.prepare(
      "INSERT INTO bots_profile (id, user_id, profile_id, name, created_at, modified_at) VALUES (1, 1, '11111111-1111-4111-8111-111111111111', 'Kid', ?, ?)",
    ).bind(now, now).run();
    await db.prepare(
      "INSERT INTO bots_bot (id, user_id, ai_model_id, bot_id, name, created_at, modified_at) VALUES (1, 1, NULL, '22222222-2222-4222-8222-222222222222', 'Penelope', ?, ?)",
    ).bind(now, now).run();
    await db.prepare(
      "INSERT INTO bots_chat (id, user_id, profile_id, bot_id, chat_id, title, created_at, modified_at) VALUES (1, 1, 1, 1, 'c1', 't', ?, ?)",
    ).bind(now, now).run();
    await db.prepare(
      'INSERT INTO bots_message (chat_id, message_id, text, role, "order", input_tokens, output_tokens, created_at, modified_at) VALUES (1, \'m1\', \'hi\', \'assistant\', 1, 10, 5, ?, ?)',
    ).bind(now, now).run();

    // No pricing rows yet: cost is 0, and that emptiness must not stick.
    expect((await costForToday(db, 1)).total).toBe(0);

    await db.prepare(
      "INSERT INTO bots_aimodel (id, model_id, name, input_token_cost, output_token_cost, is_default, supported_input_modalities, created_at, modified_at) VALUES (1, 'm', 'M', 1.0, 2.0, 1, '[\"text\"]', ?, ?)",
    ).bind(now, now).run();
    // 10*1.0 + 5*2.0 = 20 once pricing exists.
    expect((await costForToday(db, 1)).total).toBeCloseTo(20);
  });
});
