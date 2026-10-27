// Decks + flashcards — port of DeckViewSet + FlashcardViewSet.

import { Hono } from "hono";
import { authenticate } from "../auth";
import { all, count as dbCount, first, pageParams, paginated, run } from "../db";
import { newUuid } from "../crypto";
import { nowIso, type Env } from "../types";
import { isRating, applySm2 } from "../srs";
import { deckListRow, deckRow, flashcardRow } from "../serializers";
import { findByUuidOrId, isUuid, routeCtx, teenScope, type TC, makeRouter } from "./helpers";

const decks = makeRouter();
decks.use("*", authenticate);

function dueNowIso(): string {
  return new Date().toISOString();
}

// GET /api/decks/?profileId=
decks.get("/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const profileParam = c.req.query("profileId");
  const p = pageParams(new URLSearchParams(c.req.query() as Record<string, string>));
  const sp = new URLSearchParams(c.req.query() as Record<string, string>);

  let where = "d.id IN (SELECT d2.id FROM bots_deck d2 JOIN bots_profile p2 ON p2.id = d2.profile_id WHERE p2.user_id = ?)";
  const params: unknown[] = [r.user.id];
  if (scope.teen) {
    if (!scope.profile) return c.json(paginated(r.base + "/decks/", sp, p, 0, []));
    where = "d.profile_id = ?";
    params.length = 0;
    params.push(scope.profile.id);
  } else if (profileParam) {
    if (!isUuid(profileParam)) return c.json(paginated(r.base + "/decks/", sp, p, 0, []));
    const prof = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_profile WHERE profile_id = ? AND user_id = ?", profileParam.toLowerCase(), r.user.id);
    if (!prof) return c.json(paginated(r.base + "/decks/", sp, p, 0, []));
    where += " AND d.profile_id = ?";
    params.push(prof.id);
  }
  const now = dueNowIso();
  const total = await dbCount(r.env.DB, `SELECT COUNT(*) AS n FROM bots_deck d WHERE ${where}`, ...params);
  const rows = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT d.*,
       (SELECT COUNT(*) FROM bots_flashcard f WHERE f.deck_id = d.id) AS flashcard_count,
       (SELECT COUNT(*) FROM bots_flashcard f WHERE f.deck_id = d.id AND f.due_at <= ?) AS due_count,
       (SELECT MAX(f.last_reviewed_at) FROM bots_flashcard f WHERE f.deck_id = d.id) AS last_studied_at
     FROM bots_deck d WHERE ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
    now,
    ...params,
    p.limit,
    p.offset,
  );
  return c.json(paginated(r.base + "/decks/", sp, p, total, rows.map(deckListRow)));
});

async function serializeDeck(r: ReturnType<typeof routeCtx>, deckId: number) {
  const d = await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_deck WHERE id = ?", deckId);
  if (!d) return null;
  const prof = await first<{ profile_id: string }>(r.env.DB, "SELECT profile_id FROM bots_profile WHERE id = ?", d["profile_id"]);
  const chat = d["chat_id"] ? await first<{ chat_id: string }>(r.env.DB, "SELECT chat_id FROM bots_chat WHERE id = ?", d["chat_id"]) : null;
  const cards = await all<Record<string, unknown>>(
    r.env.DB,
    "SELECT f.*, p.profile_id AS deck_slug, d2.deck_id AS deck_id FROM bots_flashcard f JOIN bots_deck d2 ON d2.id = f.deck_id JOIN bots_profile p ON p.id = d2.profile_id WHERE f.deck_id = ? ORDER BY f.\"order\" ASC, f.created_at ASC",
    deckId,
  );
  void prof;
  const due = await first<{ n: number }>(r.env.DB, "SELECT COUNT(*) AS n FROM bots_flashcard WHERE deck_id = ? AND due_at <= ?", deckId, dueNowIso());
  const last = await first<{ t: string | null }>(r.env.DB, "SELECT MAX(last_reviewed_at) AS t FROM bots_flashcard WHERE deck_id = ?", deckId);
  return deckRow(
    { env: r.env, base: r.base },
    {
      ...d,
      profile_slug: (await first<{ profile_id: string }>(r.env.DB, "SELECT profile_id FROM bots_profile WHERE id = ?", d["profile_id"]))?.profile_id ?? null,
      chat_slug: chat?.chat_id ?? null,
      due_count: due?.n ?? 0,
      last_studied_at: last?.t ?? null,
    },
    cards.map((f) => ({ ...f, deck_slug: (f as Record<string, unknown>)["deck_id"] })),
  );
}

// POST /api/decks/
decks.post("/", async (c) => {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);

  let profileId: number | null = null;
  let chatPk: number | null = null;
  if (scope.teen) {
    if (!scope.profile) return c.json({ detail: "No active profile for this session" }, 403);
    profileId = scope.profile.id;
  } else {
    const profileParam = body["profile"];
    if (profileParam) {
      if (typeof profileParam !== "string" || !isUuid(profileParam)) return c.json({ profile: ["Invalid id."] }, 400);
      const prof = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_profile WHERE profile_id = ? AND user_id = ?", profileParam.toLowerCase(), r.user.id);
      if (!prof) return c.json({ profile: ["Invalid pk - object does not exist."] }, 400);
      profileId = prof.id;
    } else {
      const firstProfile = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_profile WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC", r.user.id);
      if (!firstProfile) return c.json({ profile: ["No profile available."] }, 400);
      profileId = firstProfile.id;
    }
    if (body["chat"]) {
      if (typeof body["chat"] !== "string" || !isUuid(body["chat"])) return c.json({ chat: ["Invalid id."] }, 400);
      const chat = await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_chat WHERE chat_id = ? AND user_id = ?", (body["chat"] as string).toLowerCase(), r.user.id);
      if (!chat) return c.json({ chat: ["Invalid pk - object does not exist."] }, 400);
      chatPk = chat.id;
    }
  }
  if (typeof body["name"] !== "string" || !body["name"].trim()) return c.json({ name: ["This field is required."] }, 400);
  const now = nowIso();
  const deckUuid = newUuid();
  await run(
    r.env.DB,
    "INSERT INTO bots_deck (deck_id, profile_id, chat_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    deckUuid,
    profileId,
    chatPk,
    (body["name"] as string).slice(0, 255),
    typeof body["description"] === "string" ? body["description"] : "",
    now,
    now,
  );
  const deck = (await first<{ id: number }>(r.env.DB, "SELECT id FROM bots_deck WHERE deck_id = ?", deckUuid))!;
  return c.json(await serializeDeck(r, deck.id), 201);
});

async function getOwnedDeck(c: TC, r: ReturnType<typeof routeCtx>) {
  const raw = (c.req.param("pk") ?? "");
  const deck = await findByUuidOrId<{ id: number; profile_id: number } & Record<string, unknown>>(r.env.DB, "bots_deck", "deck_id", raw);
  if (!deck) return { error: c.json({ detail: "Not found." }, 404) as Response };
  const scope = await teenScope(r);
  if (scope.teen) {
    if (!scope.profile) return { error: c.json({ detail: "Not found." }, 404) as Response };
    if (deck.profile_id !== scope.profile.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  } else {
    const prof = await first<{ user_id: number }>(r.env.DB, "SELECT user_id FROM bots_profile WHERE id = ?", deck.profile_id);
    if (!prof || prof.user_id !== r.user.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  }
  return { deck };
}

// GET /api/decks/:pk/
decks.get("/:pk/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedDeck(c, r);
  if ("error" in found) return found.error;
  return c.json(await serializeDeck(r, found.deck.id));
});

// PUT/PATCH /api/decks/:pk/
async function updateDeck(c: TC, r: ReturnType<typeof routeCtx>) {
  const found = await getOwnedDeck(c, r);
  if ("error" in found) return found.error;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [nowIso()];
  if (body["name"] !== undefined) {
    if (typeof body["name"] !== "string" || !body["name"].trim()) return c.json({ name: ["This field may not be blank."] }, 400);
    sets.push("name = ?");
    params.push((body["name"] as string).slice(0, 255));
  }
  if (body["description"] !== undefined) {
    sets.push("description = ?");
    params.push(typeof body["description"] === "string" ? body["description"] : "");
  }
  params.push(found.deck.id);
  await run(r.env.DB, `UPDATE bots_deck SET ${sets.join(", ")} WHERE id = ?`, ...params);
  return c.json(await serializeDeck(r, found.deck.id));
}
decks.put("/:pk/", async (c) => updateDeck(c, routeCtx(c)));
decks.patch("/:pk/", async (c) => updateDeck(c, routeCtx(c)));

// DELETE /api/decks/:pk/
decks.delete("/:pk/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedDeck(c, r);
  if ("error" in found) return found.error;
  await run(r.env.DB, "DELETE FROM bots_deck WHERE id = ?", found.deck.id);
  return c.body(null, 204);
});

// GET /api/decks/:pk/study_queue/?mode=&limit=
decks.get("/:pk/study_queue/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedDeck(c, r);
  if ("error" in found) return found.error;
  const mode = c.req.query("mode") ?? "due";
  if (mode !== "due" && mode !== "all") return c.json({ detail: "Invalid mode." }, 400);
  const limitRaw = c.req.query("limit");
  let limit = 50;
  if (limitRaw !== undefined) {
    limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit < 1) return c.json({ detail: "Invalid limit." }, 400);
    limit = Math.min(limit, 200);
  }
  const profile = await first<{ profile_id: string }>(r.env.DB, "SELECT profile_id FROM bots_profile WHERE id = ?", (found.deck as unknown as Record<string, unknown>)["profile_id"]);
  const rows = await all<Record<string, unknown>>(
    r.env.DB,
    `SELECT f.*, d.deck_id AS deck_slug FROM bots_flashcard f JOIN bots_deck d ON d.id = f.deck_id
     WHERE f.deck_id = ? ${mode === "due" ? "AND (f.due_at IS NULL OR f.due_at <= ?)" : ""}
     ORDER BY CASE WHEN f.due_at IS NULL THEN 1 ELSE 0 END ASC, f.due_at ASC, f."order" ASC, f.created_at ASC LIMIT ?`,
    ...((mode === "due" ? [found.deck.id, dueNowIso(), limit] : [found.deck.id, limit]) as unknown[]),
  );
  void profile;
  return c.json(rows.map((f) => flashcardRow({ ...f, deck_slug: (f as Record<string, unknown>)["deck_slug"] })));
});

// Nested flashcards: /api/decks/:deck_pk/flashcards/
decks.get("/:deck_pk/flashcards/", async (c) => {
  const r = routeCtx(c);
  const raw = (c.req.param("deck_pk") ?? "");
  const deck = await findByUuidOrId<{ id: number; profile_id: number }>(r.env.DB, "bots_deck", "deck_id", raw);
  if (!deck) return c.json({ detail: "Not found." }, 404);
  const scope = await teenScope(r);
  if (scope.teen && !scope.profile) return c.json({ detail: "Not found." }, 404);
  if (scope.teen) {
    if (deck.profile_id !== scope.profile!.id) return c.json({ detail: "Not found." }, 404);
  } else {
    const prof = await first<{ user_id: number }>(r.env.DB, "SELECT user_id FROM bots_profile WHERE id = ?", deck.profile_id);
    if (!prof || prof.user_id !== r.user.id) return c.json({ detail: "Not found." }, 404);
  }
  const cards = await all<Record<string, unknown>>(
    r.env.DB,
    "SELECT f.*, d.deck_id AS deck_slug FROM bots_flashcard f JOIN bots_deck d ON d.id = f.deck_id WHERE f.deck_id = ? ORDER BY f.\"order\" ASC, f.created_at ASC",
    deck.id,
  );
  return c.json(cards.map((f) => flashcardRow(f)));
});

decks.post("/:deck_pk/flashcards/", async (c) => {
  const r = routeCtx(c);
  const raw = (c.req.param("deck_pk") ?? "");
  const deck = await findByUuidOrId<{ id: number; profile_id: number }>(r.env.DB, "bots_deck", "deck_id", raw);
  if (!deck) return c.json({ detail: "Not found." }, 404);
  const scope = await teenScope(r);
  if (scope.teen) {
    if (!scope.profile || deck.profile_id !== scope.profile.id) return c.json({ detail: "Not found." }, 404);
  } else {
    const prof = await first<{ user_id: number }>(r.env.DB, "SELECT user_id FROM bots_profile WHERE id = ?", deck.profile_id);
    if (!prof || prof.user_id !== r.user.id) return c.json({ detail: "Not found." }, 404);
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body["front"] !== "string" || typeof body["back"] !== "string") {
    return c.json({ detail: "front and back are required." }, 400);
  }
  const last = await first<{ m: number | null }>(r.env.DB, 'SELECT MAX("order") AS m FROM bots_flashcard WHERE deck_id = ?', deck.id);
  const now = nowIso();
  const cardUuid = newUuid();
  await run(
    r.env.DB,
    "INSERT INTO bots_flashcard (flashcard_id, deck_id, front, back, \"order\", due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    cardUuid,
    deck.id,
    body["front"],
    body["back"],
    (last?.m ?? -1) + 1,
    now,
    now,
    now,
  );
  const deckSlug = await first<{ deck_id: string }>(r.env.DB, "SELECT deck_id FROM bots_deck WHERE id = ?", deck.id);
  const card = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_flashcard WHERE flashcard_id = ?", cardUuid))!;
  return c.json(flashcardRow({ ...card, deck_slug: deckSlug?.deck_id }), 201);
});

async function getOwnedCard(c: TC, r: ReturnType<typeof routeCtx>) {
  const deckRaw = (c.req.param("deck_pk") ?? "");
  const cardRaw = (c.req.param("flashcardId") ?? "") ?? (c.req.param("pk") ?? "");
  const deck = await findByUuidOrId<{ id: number; profile_id: number }>(r.env.DB, "bots_deck", "deck_id", deckRaw);
  if (!deck) return { error: c.json({ detail: "Not found." }, 404) as Response };
  const scope = await teenScope(r);
  if (scope.teen) {
    if (!scope.profile || deck.profile_id !== scope.profile.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  } else {
    const prof = await first<{ user_id: number }>(r.env.DB, "SELECT user_id FROM bots_profile WHERE id = ?", deck.profile_id);
    if (!prof || prof.user_id !== r.user.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  }
  const card = await findByUuidOrId<Record<string, unknown>>(r.env.DB, "bots_flashcard", "flashcard_id", cardRaw);
  if (!card || (card["deck_id"] as number) !== deck.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
  return { deck, card };
}

decks.get("/:deck_pk/flashcards/:flashcardId/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedCard(c, r);
  if ("error" in found) return found.error;
  const deckSlug = await first<{ deck_id: string }>(r.env.DB, "SELECT deck_id FROM bots_deck WHERE id = ?", found.deck.id);
  return c.json(flashcardRow({ ...found.card, deck_slug: deckSlug?.deck_id }));
});

async function updateCard(c: TC, r: ReturnType<typeof routeCtx>) {
  const found = await getOwnedCard(c, r);
  if ("error" in found) return found.error;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ detail: "Invalid JSON body" }, 400);
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [nowIso()];
  if (body["front"] !== undefined) {
    sets.push("front = ?");
    params.push(String(body["front"]));
  }
  if (body["back"] !== undefined) {
    sets.push("back = ?");
    params.push(String(body["back"]));
  }
  if (body["order"] !== undefined) {
    const n = parseInt(String(body["order"]), 10);
    if (!Number.isFinite(n) || n < 0) return c.json({ order: ["A valid non-negative integer is required."] }, 400);
    sets.push('"order" = ?');
    params.push(n);
  }
  params.push(found.card["id"]);
  await run(r.env.DB, `UPDATE bots_flashcard SET ${sets.join(", ")} WHERE id = ?`, ...params);
  const card = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_flashcard WHERE id = ?", found.card["id"]))!;
  const deckSlug = await first<{ deck_id: string }>(r.env.DB, "SELECT deck_id FROM bots_deck WHERE id = ?", found.deck.id);
  return c.json(flashcardRow({ ...card, deck_slug: deckSlug?.deck_id }));
}
decks.put("/:deck_pk/flashcards/:flashcardId/", async (c) => updateCard(c, routeCtx(c)));
decks.patch("/:deck_pk/flashcards/:flashcardId/", async (c) => updateCard(c, routeCtx(c)));

decks.delete("/:deck_pk/flashcards/:flashcardId/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedCard(c, r);
  if ("error" in found) return found.error;
  await run(r.env.DB, "DELETE FROM bots_flashcard WHERE id = ?", found.card["id"]);
  return c.body(null, 204);
});

// POST /api/decks/:deck_pk/flashcards/:flashcardId/review/
decks.post("/:deck_pk/flashcards/:flashcardId/review/", async (c) => {
  const r = routeCtx(c);
  const found = await getOwnedCard(c, r);
  if ("error" in found) return found.error;
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const rating = body?.["rating"];
  if (!isRating(rating)) return c.json({ rating: ['Must be one of: again, hard, good, easy.'] }, 400);
  const now = new Date();
  const next = applySm2(
    {
      interval_days: Number(found.card["interval_days"] ?? 0),
      ease: Number(found.card["ease"] ?? 2.5),
      reps: Number(found.card["reps"] ?? 0),
      lapses: Number(found.card["lapses"] ?? 0),
    },
    rating,
    now,
  );
  await run(
    r.env.DB,
    "UPDATE bots_flashcard SET due_at = ?, interval_days = ?, ease = ?, reps = ?, lapses = ?, last_reviewed_at = ?, updated_at = ? WHERE id = ?",
    next.due_at,
    next.interval_days,
    next.ease,
    next.reps,
    next.lapses,
    next.last_reviewed_at,
    now.toISOString(),
    found.card["id"],
  );
  await run(
    r.env.DB,
    "INSERT INTO bots_flashcardreview (flashcard_id, profile_id, rating, reviewed_at) VALUES (?, ?, ?, ?)",
    found.card["id"],
    found.deck.profile_id,
    rating,
    now.toISOString(),
  );
  const card = (await first<Record<string, unknown>>(r.env.DB, "SELECT * FROM bots_flashcard WHERE id = ?", found.card["id"]))!;
  const deckSlug = await first<{ deck_id: string }>(r.env.DB, "SELECT deck_id FROM bots_deck WHERE id = ?", found.deck.id);
  return c.json(flashcardRow({ ...card, deck_slug: deckSlug?.deck_id }));
});

export default decks;
