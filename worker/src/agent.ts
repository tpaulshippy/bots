// Chat agent loop — TypeScript port of back/bots/services/chat_agent.py.
//
// Same tools, same safety gates, same prompts, same iteration cap (6), same
// SSE event shapes. Differences from Django (documented in worker/README):
//   - Bedrock Converse via SigV4 fetch instead of langchain_aws.
//   - No prompt-caching cachePoint (cost follow-up).
//   - preview_page is not bound (no headless browser in Workers); the model
//     is never told about it, mirroring render_available() == False.
//   - Streaming is buffered: the turn runs to completion, then text is
//     emitted as token frames. Frame contract is unchanged.

import { converse, messageText, type ConverseContentBlock, type ConverseMessage, type ToolDef } from "./bedrock";
import { first, run } from "./db";
import { newUuid } from "./crypto";
import { htmlToText, validateHtmlDoc } from "./html";
import {
  evaluateText,
  policyForBot,
  recordSafetyEvent,
  REASON_GLOBAL_FLOOR,
  REASON_WEB_BLOCKED,
  STAGE_OUTPUT,
  STAGE_TOOL_FLASHCARD,
  STAGE_TOOL_HTML_PAGE,
  STAGE_WEB_QUERY,
  STAGE_WEB_RESULT,
  type SafetyEventContext,
  type SafetyPolicy,
  type SafetyVerdict,
} from "./safety";
import { tavilySearch } from "./tavily";
import { nowIso, type BotRow, type ChatRow, type Env, type ProfileRow } from "./types";

export const MAX_ITERATIONS = 6;

export const HTML_GUIDANCE =
  "HTML pages are enabled: you can build single-file web pages for the kid.\n" +
  "Call save_html_page ONCE with the title AND the complete single-file html document.\n" +
  "To change a page, call save_html_page again with the SAME page_id and the full replacement html.\n" +
  "Keep pages small (under ~15KB): every update resends the whole document.\n" +
  "Ignore reply length or word-count limits while emitting page content.\n" +
  "Always mention the page title in your reply so the kid can reference it later.";

export const WEB_SEARCH_GUIDANCE =
  "Web search is enabled: you can call the web_search tool for current information.\n" +
  "Use it for up-to-date facts, recent events, or anything beyond your training data.";

export const WEB_SEARCH_UNAVAILABLE = "Web search is not available.";
export const WEB_QUERY_BLOCKED = "This search query was blocked by the safety policy. Please try a different question.";
export const NO_SAFE_RESULTS = "No safe results found.";
export const HTML_PAGE_BLOCKED = "I can't save that page because it didn't pass the safety check. Please adjust the wording and try again.";
export const HTML_PAGE_DISABLED = "HTML pages are not enabled for this bot.";
export const HTML_PAGE_TOO_LARGE = "That page is too large. Please keep pages under 200KB.";
export const FLASHCARD_BLOCKED = "I can't save that flashcard because it didn't pass the safety check. Please adjust the wording and try again.";

export interface AgentChip {
  kind: string;
  [k: string]: unknown;
}

export interface ClientEvent {
  tool: string;
  [k: string]: unknown;
}

function deckChip(e: ClientEvent): AgentChip | null {
  if (!e["deck_id"]) return null;
  return { kind: "deck", deck_id: e["deck_id"], name: e["name"] ?? "deck", card_count: e["card_count"] ?? 0 };
}
function singleCardChip(e: ClientEvent): AgentChip | null {
  if (!e["deck_id"]) return null;
  return { kind: "sources", label: "📇 Card added" };
}
function searchChip(e: ClientEvent): AgentChip | null {
  const preview = e["result_preview"];
  return { kind: "sources", label: typeof preview === "string" && preview ? `🌐 ${preview}` : "🌐 Sources used" };
}
function pageChip(e: ClientEvent): AgentChip | null {
  if (!e["page_id"]) return null;
  return { kind: "page", page_id: e["page_id"], name: e["name"] ?? "page" };
}

export function clientEventsToAgentEvents(events: ClientEvent[]): AgentChip[] {
  const out: AgentChip[] = [];
  for (const event of events ?? []) {
    let chip: AgentChip | null = null;
    if (event.tool === "create_flashcard_deck") chip = deckChip(event);
    else if (event.tool === "create_flashcard") chip = singleCardChip(event);
    else if (event.tool === "web_search") chip = searchChip(event);
    else if (event.tool === "save_html_page") chip = pageChip(event);
    if (chip) out.push(chip);
  }
  return out;
}

export interface TurnContext {
  env: Env;
  db: D1Database;
  chat: ChatRow;
  bot: BotRow | null;
  profile: ProfileRow | null;
  modelId: string;
  policy: SafetyPolicy;
  safetyCtx: SafetyEventContext;
  openaiKey: string;
}

export type AgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool_end"; tool: string; [k: string]: unknown }
  | { type: "done"; input_tokens: number; output_tokens: number };

export function buildSystemPrompt(bot: BotRow | null, tavilyKey: string): string {
  let prompt = bot?.system_prompt ?? "";
  if (bot && bot.enable_html_pages === 1) prompt = `${prompt}\n\n${HTML_GUIDANCE}`.trim();
  if (bot && bot.enable_web_search === 1 && tavilyKey) prompt = `${prompt}\n\n${WEB_SEARCH_GUIDANCE}`.trim();
  return prompt;
}

export async function pageCatalog(db: D1Database, ctx: TurnContext): Promise<string | null> {
  if (!ctx.bot || ctx.bot.enable_html_pages !== 1 || !ctx.profile) return null;
  try {
    const pages = await db
      .prepare(
        `SELECT p.page_id, p.title, p.updated_at, c.id AS chat_pk, c.title AS chat_title
         FROM bots_htmlpage p LEFT JOIN bots_chat c ON c.id = p.chat_id
         WHERE p.profile_id = ? ORDER BY p.updated_at DESC LIMIT 10`,
      )
      .bind(ctx.profile.id)
      .all<{ page_id: string; title: string; updated_at: string; chat_pk: number | null; chat_title: string | null }>();
    const rows = pages.results ?? [];
    if (rows.length === 0) return null;
    const lines = ["The kid's saved HTML pages (to refine one, call save_html_page with its page_id and the full replacement html):"];
    for (const p of [...rows].reverse()) {
      const marker = p.chat_pk === ctx.chat.id ? " (this chat)" : ` (from chat '${p.chat_title ?? "this chat"}')`;
      const updated = (p.updated_at ?? "").slice(0, 16).replace("T", " ");
      lines.push(`- '${p.title}' page_id=${p.page_id} updated=${updated}${marker}`);
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}

// --- tools ---------------------------------------------------------------

function toolDefs(ctx: TurnContext): ToolDef[] {
  const tools: ToolDef[] = [
    {
      name: "create_flashcard_deck",
      description:
        "Create a new flashcard deck with flashcards. Use this when the user wants to create flashcards for studying.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: 'The name of the deck (e.g., "Biology Test Terms")' },
          flashcards: {
            type: "array",
            description: "List of flashcards, each with 'front' and 'back' keys. Must include at least one card.",
            items: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] },
          },
          description: { type: "string", description: "Optional description of the deck" },
        },
        required: ["name", "flashcards"],
      },
    },
    {
      name: "create_flashcard",
      description: "Add a single flashcard to an existing deck or create a new deck. Use this when the user wants to add flashcards to study.",
      inputSchema: {
        type: "object",
        properties: {
          deck_name: { type: "string" },
          front: { type: "string" },
          back: { type: "string" },
        },
        required: ["deck_name", "front", "back"],
      },
    },
  ];
  if (ctx.bot && ctx.bot.enable_web_search === 1 && ctx.env.TAVILY_API_KEY) {
    tools.push({
      name: "web_search",
      description: "Search the web for current information. Use this when you need up-to-date information or facts that may not be in your training data. Queries and results are filtered for teen-safe content.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    });
  }
  if (ctx.bot && ctx.bot.enable_html_pages === 1 && ctx.profile) {
    tools.push({
      name: "save_html_page",
      description:
        "Save a single-file HTML page for the kid (create or update). Omit page_id to create a new page. To change an existing page, pass its page_id with the FULL replacement html document. Keep html under ~15KB. Ignore reply length or word-count limits while emitting page content.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short page title shown in chat (required for new pages)." },
          html: { type: "string", description: "Complete single-file HTML document (always required)." },
          page_id: { type: "string", description: "Existing page to replace in place; empty to create." },
        },
        required: ["title", "html"],
      },
    });
  }
  return tools;
}

async function toolCreateFlashcardDeck(ctx: TurnContext, args: Record<string, unknown>): Promise<{ text: string; event?: ClientEvent }> {
  const { db } = ctx;
  const name = typeof args["name"] === "string" ? args["name"] : "";
  const flashcards = Array.isArray(args["flashcards"]) ? (args["flashcards"] as unknown[]) : null;
  const description = typeof args["description"] === "string" ? args["description"] : "";
  if (!name || !flashcards || flashcards.length === 0) {
    return { text: "Missing required arguments. Call create_flashcard_deck again with 'name' and a non-empty 'flashcards' list." };
  }
  if (!ctx.profile) return { text: "Error creating deck: no profile on this chat." };
  const deckVerdict = await evaluateText(`${name} ${description}`, ctx.policy, ctx.openaiKey, "OUTPUT");
  if (deckVerdict.blocked) {
    await recordSafetyEvent(db, STAGE_TOOL_FLASHCARD, deckVerdict, ctx.safetyCtx, `${name} ${description}`);
    return { text: FLASHCARD_BLOCKED };
  }
  for (const card of flashcards) {
    const c = card as Record<string, unknown>;
    const fv = await evaluateText(`${c["front"] ?? ""} ${c["back"] ?? ""}`, ctx.policy, ctx.openaiKey, "OUTPUT");
    if (fv.blocked) {
      await recordSafetyEvent(db, STAGE_TOOL_FLASHCARD, fv, ctx.safetyCtx, `${c["front"] ?? ""} ${c["back"] ?? ""}`);
      return { text: FLASHCARD_BLOCKED };
    }
  }
  try {
    const deckId = newUuid();
    const now = nowIso();
    await run(
      db,
      "INSERT INTO bots_deck (deck_id, profile_id, chat_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      deckId,
      ctx.profile.id,
      ctx.chat.id,
      name,
      description,
      now,
      now,
    );
    const deckRow = await first<{ id: number }>(db, "SELECT id FROM bots_deck WHERE deck_id = ?", deckId);
    let created = 0;
    for (let i = 0; i < flashcards.length; i++) {
      const c = flashcards[i] as Record<string, unknown>;
      await run(
        db,
        "INSERT INTO bots_flashcard (flashcard_id, deck_id, front, back, \"order\", due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        newUuid(),
        deckRow!.id,
        String(c["front"] ?? ""),
        String(c["back"] ?? ""),
        i,
        now,
        now,
        now,
      );
      created++;
    }
    const event: ClientEvent = { tool: "create_flashcard_deck", deck_id: deckId, name, card_count: created };
    return { text: `Created deck '${name}' with ${created} flashcards. Deck ID: ${deckId}`, event };
  } catch (e) {
    return { text: `Error creating deck: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function toolCreateFlashcard(ctx: TurnContext, args: Record<string, unknown>): Promise<{ text: string; event?: ClientEvent }> {
  const { db } = ctx;
  const deckName = typeof args["deck_name"] === "string" ? args["deck_name"] : "";
  const front = typeof args["front"] === "string" ? args["front"] : "";
  const back = typeof args["back"] === "string" ? args["back"] : "";
  if (!deckName || !front || !back) {
    return { text: "Missing required arguments. Call create_flashcard again with 'deck_name', 'front', and 'back'." };
  }
  if (!ctx.profile) return { text: "Error creating flashcard: no profile on this chat." };
  const nameVerdict = await evaluateText(deckName, ctx.policy, ctx.openaiKey, "OUTPUT");
  if (nameVerdict.blocked) {
    await recordSafetyEvent(db, STAGE_TOOL_FLASHCARD, nameVerdict, ctx.safetyCtx, deckName);
    return { text: FLASHCARD_BLOCKED };
  }
  const cardVerdict = await evaluateText(`${front} ${back}`, ctx.policy, ctx.openaiKey, "OUTPUT");
  if (cardVerdict.blocked) {
    await recordSafetyEvent(db, STAGE_TOOL_FLASHCARD, cardVerdict, ctx.safetyCtx, `${front} ${back}`);
    return { text: FLASHCARD_BLOCKED };
  }
  try {
    let deck = await first<{ id: number; deck_id: string }>(
      db,
      "SELECT id, deck_id FROM bots_deck WHERE profile_id = ? AND name = ?",
      ctx.profile.id,
      deckName,
    );
    if (!deck) {
      const deckId = newUuid();
      const now = nowIso();
      await run(
        db,
        "INSERT INTO bots_deck (deck_id, profile_id, chat_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        deckId,
        ctx.profile.id,
        ctx.chat.id,
        deckName,
        "",
        now,
        now,
      );
      deck = await first<{ id: number; deck_id: string }>(db, "SELECT id, deck_id FROM bots_deck WHERE deck_id = ?", deckId);
    }
    const last = await first<{ max_order: number | null }>(
      db,
      'SELECT MAX("order") AS max_order FROM bots_flashcard WHERE deck_id = ?',
      deck!.id,
    );
    const now = nowIso();
    await run(
      db,
      "INSERT INTO bots_flashcard (flashcard_id, deck_id, front, back, \"order\", due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      newUuid(),
      deck!.id,
      front,
      back,
      (last?.max_order ?? -1) + 1,
      now,
      now,
      now,
    );
    const event: ClientEvent = { tool: "create_flashcard", deck_id: deck!.deck_id, name: deckName };
    return { text: `Added flashcard to deck '${deckName}'. Deck ID: ${deck!.deck_id}`, event };
  } catch (e) {
    return { text: `Error creating flashcard: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function toolWebSearch(ctx: TurnContext, args: Record<string, unknown>): Promise<{ text: string; event?: ClientEvent }> {
  const { db } = ctx;
  const query = typeof args["query"] === "string" ? args["query"] : "";
  if (!query) return { text: "Missing required arguments. Call web_search again with 'query'." };
  if (!ctx.bot || ctx.bot.enable_web_search !== 1 || !ctx.env.TAVILY_API_KEY) return { text: WEB_SEARCH_UNAVAILABLE };
  const queryVerdict = await evaluateText(query, ctx.policy, ctx.openaiKey, "INPUT");
  if (queryVerdict.blocked) {
    const eventVerdict: SafetyVerdict =
      queryVerdict.reason_code !== REASON_GLOBAL_FLOOR
        ? { blocked: true, reason_code: REASON_WEB_BLOCKED, matched_terms: queryVerdict.matched_terms }
        : queryVerdict;
    await recordSafetyEvent(db, STAGE_WEB_QUERY, eventVerdict, ctx.safetyCtx, query);
    return { text: WEB_QUERY_BLOCKED };
  }
  try {
    const results = await tavilySearch(ctx.env.TAVILY_API_KEY, query);
    const event: ClientEvent = { tool: "web_search", query, result_preview: `${results.length} results` };
    const formatted: string[] = [];
    for (const r of results.slice(0, 3)) {
      const snippet = `${r.title} ${r.content.slice(0, 200)}`;
      const rv = await evaluateText(snippet, ctx.policy, ctx.openaiKey, "OUTPUT");
      if (rv.blocked) {
        await recordSafetyEvent(db, STAGE_WEB_RESULT, rv, ctx.safetyCtx, snippet);
        continue;
      }
      formatted.push(`- ${r.title || "No title"}: ${r.content.slice(0, 200)}`);
    }
    if (formatted.length === 0) return { text: NO_SAFE_RESULTS, event };
    return { text: formatted.join("\n"), event };
  } catch (e) {
    return { text: `Error during search: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function validateFullHtml(
  db: D1Database,
  ctx: TurnContext,
  title: string,
  html: string,
): Promise<string | null> {
  if (new TextEncoder().encode(html).length > 200_000) return HTML_PAGE_TOO_LARGE;
  const checked = validateHtmlDoc(html);
  if (!checked.ok) return checked.detail === "HTML must be a single self-contained page." ? "HTML must be a single self-contained page." : checked.detail;
  const verdict = await evaluateText(`${title} ${htmlToText(html)}`, ctx.policy, ctx.openaiKey, "OUTPUT");
  if (verdict.blocked) {
    await recordSafetyEvent(db, STAGE_TOOL_HTML_PAGE, verdict, ctx.safetyCtx, `${title} ${htmlToText(html).slice(0, 200)}`);
    return HTML_PAGE_BLOCKED;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function toolSaveHtmlPage(ctx: TurnContext, args: Record<string, unknown>): Promise<{ text: string; event?: ClientEvent }> {
  const { db } = ctx;
  const title = typeof args["title"] === "string" ? args["title"] : "";
  const html = typeof args["html"] === "string" ? args["html"] : "";
  const pageId = typeof args["page_id"] === "string" ? args["page_id"].trim() : "";
  if (!(html || "").trim()) {
    return { text: "html is required: call save_html_page again with the complete HTML document." };
  }
  if (!ctx.profile) return { text: HTML_PAGE_DISABLED };

  if (pageId) {
    if (!UUID_RE.test(pageId)) return { text: "Unknown page. Ask which page to update or save a new one without page_id." };
    const page = await first<{ id: number; title: string }>(
      db,
      "SELECT id, title FROM bots_htmlpage WHERE page_id = ? AND profile_id = ?",
      pageId,
      ctx.profile.id,
    );
    if (!page) return { text: "Unknown page. Ask which page to update or save a new one without page_id." };
    const newTitle = title.trim().slice(0, 255) || page.title;
    const error = await validateFullHtml(db, ctx, newTitle, html);
    if (error) return { text: error };
    try {
      await run(db, "UPDATE bots_htmlpage SET html = ?, title = ?, updated_at = ? WHERE id = ?", html, newTitle, nowIso(), page.id);
      const event: ClientEvent = { tool: "save_html_page", page_id: pageId, name: newTitle };
      return { text: `Updated page '${newTitle}'. Reopen /api/html-pages/${pageId}/raw/ to see the changes`, event };
    } catch (e) {
      return { text: `Error saving page: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const cleanTitle = title.trim().slice(0, 255);
  if (!cleanTitle) return { text: "Title is required." };
  const error = await validateFullHtml(db, ctx, cleanTitle, html);
  if (error) return { text: error };
  try {
    const newPageId = newUuid();
    await run(
      db,
      "INSERT INTO bots_htmlpage (page_id, profile_id, chat_id, bot_id, title, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      newPageId,
      ctx.profile.id,
      ctx.chat.id,
      ctx.bot?.id ?? null,
      cleanTitle,
      html,
      nowIso(),
      nowIso(),
    );
    const event: ClientEvent = { tool: "save_html_page", page_id: newPageId, name: cleanTitle };
    return { text: `Saved page '${cleanTitle}'. Open it in the browser with /api/html-pages/${newPageId}/raw`, event };
  } catch (e) {
    return { text: `Error saving page: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function executeTool(
  ctx: TurnContext,
  toolName: string,
  toolArgs: Record<string, unknown>,
  hasWebSearch: boolean,
): Promise<{ text: string; event?: ClientEvent }> {
  try {
    if (toolName === "web_search" && !hasWebSearch) return { text: WEB_SEARCH_UNAVAILABLE };
    if (toolName === "create_flashcard_deck") return await toolCreateFlashcardDeck(ctx, toolArgs);
    if (toolName === "create_flashcard") return await toolCreateFlashcard(ctx, toolArgs);
    if (toolName === "web_search") return await toolWebSearch(ctx, toolArgs);
    if (toolName === "save_html_page") return await toolSaveHtmlPage(ctx, toolArgs);
    return { text: `Unknown tool: ${toolName}` };
  } catch (e) {
    return { text: `The ${toolName} tool failed (${e instanceof Error ? e.message : String(e)}). Fix the arguments and try again.` };
  }
}

// --- deterministic fake client for e2e/demo (e2e-fake-stream* models) ------

export const FAKE_MODEL_PREFIX = "e2e-fake-stream";
const FAKE_FINAL_ANSWER =
  "Mitosis has four main stages: prophase, metaphase, anaphase, and telophase. " +
  "In prophase the chromosomes condense, in metaphase they line up, in anaphase they pull apart, " +
  "and in telophase two new nuclei form. I saved a Cell Bio deck so you can practice!";

interface FakeTurn {
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  text: string;
}

function fakeTurn(historyAssistantCount: number): FakeTurn {
  if (historyAssistantCount === 0) {
    return {
      toolCalls: [
        {
          id: "fake_call_1",
          name: "create_flashcard_deck",
          args: {
            name: "Cell Bio",
            description: "Mitosis study deck",
            flashcards: [
              { front: "What happens in prophase?", back: "Chromosomes condense" },
              { front: "What happens in metaphase?", back: "Chromosomes line up" },
              { front: "What happens in anaphase?", back: "Chromatids pull apart" },
            ],
          },
        },
      ],
      text: "",
    };
  }
  return { toolCalls: [], text: FAKE_FINAL_ANSWER };
}

export function isFakeModel(modelId: string, allowFake: boolean): boolean {
  return modelId.startsWith(FAKE_MODEL_PREFIX) && allowFake;
}

// --- agent loop ------------------------------------------------------------

export interface TurnResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  clientEvents: ClientEvent[];
}

export async function* runAgentTurn(
  ctx: TurnContext,
  history: ConverseMessage[],
  opts?: { allowFake?: boolean; system?: string },
): AsyncGenerator<AgentStreamEvent, TurnResult, void> {
  const allowFake = opts?.allowFake ?? (ctx.env.ALLOW_E2E_FAKE_STREAM ?? "false") === "true";
  const tools = toolDefs(ctx);
  const hasWebSearch = tools.some((t) => t.name === "web_search");
  const messages: ConverseMessage[] = history.map((m) => ({ role: m.role, content: m.content.map((b) => ({ ...b })) }));
  const clientEvents: ClientEvent[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = "";
  const historyAssistantCount = history.filter((m) => m.role === "assistant").length;
  let fakeCalls = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    let content: ConverseContentBlock[];
    if (isFakeModel(ctx.modelId, allowFake)) {
      const turn = fakeTurn(historyAssistantCount + fakeCalls);
      if (turn.toolCalls.length > 0) {
        fakeCalls++;
        content = turn.toolCalls.map((t) => ({ toolUse: { toolUseId: t.id, name: t.name, input: t.args } }));
      } else {
        content = [{ text: turn.text }];
        inputTokens += 42;
        outputTokens += 128;
      }
    } else {
      const res = await converse(ctx.env, ctx.modelId, opts?.system ?? null, messages, tools);
      content = res.content;
      inputTokens += res.inputTokens;
      outputTokens += res.outputTokens;
    }

    const toolUses = content.filter(
      (b): b is { toolUse: { toolUseId: string; name: string; input: unknown } } =>
        typeof b === "object" && b !== null && "toolUse" in b,
    );
    const text = messageText(content);
    if (!toolUses.length) {
      lastText = text || lastText;
      break;
    }
    // Assistant message carrying tool calls (echo back for the next round).
    messages.push({ role: "assistant", content });
    const eventsBefore = clientEvents.length;
    for (const tu of toolUses) {
      const args = (tu.toolUse.input ?? {}) as Record<string, unknown>;
      yield { type: "tool_start", tool: tu.toolUse.name, args };
      const result = await executeTool(ctx, tu.toolUse.name, args, hasWebSearch);
      if (result.event) clientEvents.push(result.event);
      const toolEnd: AgentStreamEvent = { type: "tool_end", tool: tu.toolUse.name };
      for (const ev of [...clientEvents.slice(eventsBefore)].reverse()) {
        if (ev.tool === tu.toolUse.name) {
          for (const [k, v] of Object.entries(ev)) if (k !== "tool") (toolEnd as Record<string, unknown>)[k] = v;
          break;
        }
      }
      yield toolEnd;
      messages.push({
        role: "user",
        content: [{ toolResult: { toolUseId: tu.toolUse.toolUseId, content: { text: result.text } } }],
      });
    }
  }

  // Extract final response: last assistant text without tool calls.
  if (!lastText) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      const hasTools = m.content.some((b) => typeof b === "object" && b !== null && "toolUse" in b);
      if (!hasTools) {
        const t = messageText(m.content);
        if (t) {
          lastText = t;
          break;
        }
      }
    }
    if (!lastText && isFakeModel(ctx.modelId, allowFake)) lastText = FAKE_FINAL_ANSWER;
  }

  // Buffered token emission (documented): same frames, non-incremental source.
  if (lastText) {
    const words = lastText.split(/(\s+)/);
    let buf = "";
    for (const w of words) {
      buf += w;
      if (buf.length >= 24 || /[.!?]\s*$/.test(buf)) {
        yield { type: "token", text: buf };
        buf = "";
      }
    }
    if (buf) yield { type: "token", text: buf };
  }
  yield { type: "done", input_tokens: inputTokens, output_tokens: outputTokens };
  return { text: lastText, inputTokens, outputTokens, clientEvents };
}

export function buildTurnContext(
  env: Env,
  db: D1Database,
  chat: ChatRow,
  bot: BotRow | null,
  profile: ProfileRow | null,
  modelId: string,
): TurnContext {
  return {
    env,
    db,
    chat,
    bot,
    profile,
    modelId,
    policy: policyForBot(bot),
    safetyCtx: {
      userId: chat.user_id,
      profileId: profile?.id ?? chat.profile_id,
      chatId: chat.id,
      botId: bot?.id ?? chat.bot_id,
      messageId: null,
    },
    openaiKey: env.OPENAI_API_KEY ?? "",
  };
}
