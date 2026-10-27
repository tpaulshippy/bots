// Chat turn endpoints — port of get_chat_response + stream_chat_response.
// POST /api/chats/:chatId  (blocking, legacy) and POST /api/chats/:chatId/stream (SSE).

import { Hono } from "hono";
import type { TC } from "./helpers";
import { authenticate } from "../auth";
import { buildSystemPrompt, clientEventsToAgentEvents, runAgentTurn } from "../agent";
import {
  applyOutputFilter,
  createUserMessage,
  inputRefusal,
  loadChatGraph,
  makeTurnContext,
  OVER_LIMIT_MESSAGE,
  persistAssistantMessage,
  prepareSystemAndHistory,
  resolveModelForTurn,
} from "../chat";
import { first, run } from "../db";
import { allowedFile, storeUpload } from "../images";
import { notifyNewChat, notifyNewMessage } from "../push";
import { overLimit } from "../usage";
import { newUuid } from "../crypto";
import { nowIso, type BotRow, type ChatRow, type Env, type ProfileRow } from "../types";
import { findByUuidOrId, routeCtx, teenScope, makeRouter } from "./helpers";

const turn = makeRouter();
turn.use("*", authenticate);

interface TurnBody {
  message: string;
  profile?: string;
  bot?: string;
  image?: File | null;
}

async function parseTurnBody(c: TC): Promise<TurnBody | null> {
  const ctype = c.req.header("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      const j = (await c.req.json()) as Record<string, unknown>;
      return {
        message: typeof j["message"] === "string" ? j["message"] : "",
        profile: typeof j["profile"] === "string" ? j["profile"] : undefined,
        bot: typeof j["bot"] === "string" ? j["bot"] : undefined,
      };
    }
    const form = await c.req.parseBody();
    const file = form["image"];
    return {
      message: typeof form["message"] === "string" ? (form["message"] as string) : "",
      profile: typeof form["profile"] === "string" ? (form["profile"] as string) : undefined,
      bot: typeof form["bot"] === "string" ? (form["bot"] as string) : undefined,
      image: file instanceof File ? file : null,
    };
  } catch {
    return null;
  }
}

async function setupChat(
  c: TC,
  chatIdParam: string,
  body: TurnBody,
) {
  const r = routeCtx(c);
  const scope = await teenScope(r);
  if (scope.teen && !scope.profile) {
    return { error: c.json({ error: "No active profile for this session" }, 403) as Response };
  }

  let chat: ChatRow;
  let isNew = false;
  if (chatIdParam === "new") {
    let profile: ProfileRow | null = scope.profile;
    let bot: BotRow | null = null;
    if (!scope.teen && body.profile) {
      profile = await first<ProfileRow>(r.env.DB, "SELECT * FROM bots_profile WHERE profile_id = ? AND user_id = ? AND deleted_at IS NULL", body.profile.toLowerCase(), r.user.id);
      if (!profile) return { error: c.json({ detail: "Not found." }, 404) as Response };
    } else if (!scope.teen) {
      profile = null;
    }
    if (body.bot) {
      bot = await first<BotRow>(r.env.DB, "SELECT * FROM bots_bot WHERE bot_id = ? AND user_id = ? AND deleted_at IS NULL", body.bot.toLowerCase(), r.user.id);
      if (!bot) return { error: c.json({ detail: "Not found." }, 404) as Response };
    }
    const now = nowIso();
    const chatUuid = newUuid();
    await run(
      r.env.DB,
      "INSERT INTO bots_chat (user_id, profile_id, bot_id, chat_id, title, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      r.user.id,
      profile?.id ?? null,
      bot?.id ?? null,
      chatUuid,
      body.message ?? "",
      now,
      now,
    );
    chat = (await first<ChatRow>(r.env.DB, "SELECT * FROM bots_chat WHERE chat_id = ?", chatUuid))!;
    isNew = true;
    const systemPrompt = buildSystemPrompt(bot, r.env.TAVILY_API_KEY ?? "");
    if (systemPrompt) {
      await run(
        r.env.DB,
        "INSERT INTO bots_message (chat_id, message_id, text, role, \"order\", created_at, modified_at) VALUES (?, ?, ?, 'system', 0, ?, ?)",
        chat.id,
        newUuid(),
        systemPrompt,
        now,
        now,
      );
    }
  } else {
    const found = await findByUuidOrId<ChatRow>(r.env.DB, "bots_chat", "chat_id", chatIdParam);
    if (!found || found.user_id !== r.user.id) return { error: c.json({ detail: "Not found." }, 404) as Response };
    if (scope.profile && found.profile_id !== scope.profile.id) return { error: c.json({ error: "Chat not found" }, 404) as Response };
    chat = found;
  }

  let filename: string | null = null;
  if (body.image) {
    if (body.image.size > 20 * 1024 * 1024) return { error: c.json({ error: "File size exceeds 20MB limit" }, 400) as Response };
    if (!allowedFile(body.image.name)) return { error: c.json({ error: "Invalid file type" }, 400) as Response };
    filename = await storeUpload(r.env, await body.image.arrayBuffer(), body.image.name, body.image.type);
  }

  const userMessage = await createUserMessage(r.env.DB, chat.id, body.message ?? "", filename);
  return { r, scope, chat, isNew, userMessage, filename };
}

type Setup = Exclude<Awaited<ReturnType<typeof setupChat>>, { error: Response }>;

// Blocking legacy turn: GET or POST /api/chats/:chatId
async function blockingTurn(c: TC) {
  const chatIdParam = (c.req.param("chatId") ?? "");
  const body = (await parseTurnBody(c)) ?? { message: "" };
  const setup = await setupChat(c, chatIdParam, body);
  if ("error" in setup) return setup.error;
  const { r, chat, isNew, userMessage } = setup as Setup;

  if (isNew) c.executionCtx.waitUntil(notifyNewChat(r.env.DB, r.user.id, chat.title).catch(() => undefined));
  c.executionCtx.waitUntil(notifyNewMessage(r.env.DB, r.user.id, chat.title, body.message ?? "").catch(() => undefined));

  const graph = (await loadChatGraph(r.env.DB, chat.id))!;
  const refusal = await inputRefusal(r.env.DB, r.env, graph, userMessage.id);
  if (refusal !== null) {
    c.executionCtx.waitUntil(notifyNewMessage(r.env.DB, r.user.id, chat.title, refusal).catch(() => undefined));
    return c.json({ response: refusal, chat_id: chat.chat_id });
  }

  if (await overLimit(r.env.DB, r.user.id)) {
    return c.json({ response: OVER_LIMIT_MESSAGE, chat_id: chat.chat_id });
  }

  const { system, history, containsImage } = await prepareSystemAndHistory(r.env, r.env.DB, graph);
  let modelId: string;
  try {
    modelId = await resolveModelForTurn(graph, containsImage);
  } catch {
    return c.json({ response: "The AI model is not configured. Please try again later.", chat_id: chat.chat_id });
  }
  const tctx = makeTurnContext(r.env, r.env.DB, graph, modelId);
  const gen = runAgentTurn(tctx, history, { system });
  let final = { text: "", inputTokens: 0, outputTokens: 0, clientEvents: [] as { tool: string; [k: string]: unknown }[] };
  for (;;) {
    const step = await gen.next();
    if (step.done) {
      final = step.value;
      break;
    }
  }
  const filtered = await applyOutputFilter(r.env.DB, r.env, graph, final.text, null);
  const agentEvents = JSON.stringify(clientEventsToAgentEvents(final.clientEvents));
  const assistant = await persistAssistantMessage(
    r.env.DB,
    graph,
    filtered.text,
    { input_tokens: final.inputTokens, output_tokens: final.outputTokens },
    agentEvents,
    modelId,
  );
  if (filtered.flagged !== null && filtered.verdict) {
    // Re-record with the assistant row id for the parent inbox link.
    const { recordSafetyEvent, STAGE_OUTPUT } = await import("../safety");
    await recordSafetyEvent(
      r.env.DB,
      STAGE_OUTPUT,
      filtered.verdict,
      { userId: graph.chat.user_id, profileId: graph.profile?.id ?? graph.chat.profile_id, chatId: graph.chat.id, botId: graph.bot?.id ?? graph.chat.bot_id, messageId: assistant.id },
      filtered.flagged,
    );
  }
  c.executionCtx.waitUntil(notifyNewMessage(r.env.DB, r.user.id, chat.title, filtered.text).catch(() => undefined));

  const data: Record<string, unknown> = { response: filtered.text, chat_id: chat.chat_id };
  const deckEvents = final.clientEvents
    .filter((e) => e.tool === "create_flashcard_deck")
    .map((e) => ({ type: "flashcard_deck_created", deck_id: e["deck_id"], name: e["name"], card_count: e["card_count"] }));
  const pageEvents = final.clientEvents
    .filter((e) => e.tool === "save_html_page")
    .map((e) => ({ type: "html_page_created", page_id: e["page_id"], name: e["name"] ?? "page" }));
  if (deckEvents.length > 0 || pageEvents.length > 0) data["events"] = [...deckEvents, ...pageEvents];
  return c.json(data);
}

turn.get("/:chatId", blockingTurn);
turn.post("/:chatId", blockingTurn);

// SSE streaming turn: POST /api/chats/:chatId/stream
turn.post("/:chatId/stream", async (c) => {
  const chatIdParam = (c.req.param("chatId") ?? "");
  const body = (await parseTurnBody(c)) ?? { message: "" };
  if (!body.message && !body.image) return c.json({ error: "message is required" }, 400);
  const setup = await setupChat(c, chatIdParam, body);
  if ("error" in setup) return setup.error;
  const { r, chat, isNew, userMessage } = setup as Setup;

  if (isNew) c.executionCtx.waitUntil(notifyNewChat(r.env.DB, r.user.id, chat.title).catch(() => undefined));

  const assistantMessageId = newUuid();
  const graph = (await loadChatGraph(r.env.DB, chat.id))!;

  const frame = (event: string, payload: unknown): string => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, payload: unknown): void => {
        controller.enqueue(enc.encode(frame(event, payload)));
      };
      send("meta", { chat_id: chat.chat_id, message_id: assistantMessageId });
      try {
        const refusal = await inputRefusal(r.env.DB, r.env, graph, userMessage.id, assistantMessageId);
        if (refusal !== null) {
          send("token", { text: refusal });
          send("done", { input_tokens: 0, output_tokens: 0, message_id: assistantMessageId });
          controller.close();
          return;
        }
        if (await overLimit(r.env.DB, r.user.id)) {
          send("error", { code: "over_limit", message: OVER_LIMIT_MESSAGE });
          controller.close();
          return;
        }
        const { system, history, containsImage } = await prepareSystemAndHistory(r.env, r.env.DB, graph);
        let modelId: string;
        try {
          modelId = await resolveModelForTurn(graph, containsImage);
        } catch {
          send("error", { code: "internal", message: "The AI model is not configured. Please try again later." });
          controller.close();
          return;
        }
        const tctx = makeTurnContext(r.env, r.env.DB, graph, modelId);
        const gen = runAgentTurn(tctx, history, { system });
        let streamedText = "";
        let clientEvents: { tool: string; [k: string]: unknown }[] = [];
        let usage = { input_tokens: 0, output_tokens: 0 };
        for (;;) {
          const step = await gen.next();
          if (step.done) {
            streamedText = step.value.text;
            clientEvents = step.value.clientEvents;
            usage = { input_tokens: step.value.inputTokens, output_tokens: step.value.outputTokens };
            break;
          }
          const ev = step.value;
          if (ev.type === "token") {
            streamedText += ev.text;
            send("token", { text: ev.text });
          } else if (ev.type === "tool_start" || ev.type === "tool_end") {
            const { type: _t, ...rest } = ev as { type: string; [k: string]: unknown };
            send("status", { type: ev.type, ...rest });
          } else if (ev.type === "done") {
            usage = { input_tokens: ev.input_tokens, output_tokens: ev.output_tokens };
          }
        }
        const persist = async (text: string): Promise<void> => {
          const filtered = await applyOutputFilter(r.env.DB, r.env, graph, text, null);
          const agentEvents = JSON.stringify(clientEventsToAgentEvents(clientEvents));
          const assistant = await persistAssistantMessage(r.env.DB, graph, filtered.text, usage, agentEvents, modelId, assistantMessageId);
          if (filtered.flagged !== null && filtered.verdict) {
            const { recordSafetyEvent, STAGE_OUTPUT } = await import("../safety");
            await recordSafetyEvent(
              r.env.DB,
              STAGE_OUTPUT,
              filtered.verdict,
              { userId: graph.chat.user_id, profileId: graph.profile?.id ?? graph.chat.profile_id, chatId: graph.chat.id, botId: graph.bot?.id ?? graph.chat.bot_id, messageId: assistant.id },
              filtered.flagged,
            );
          }
          c.executionCtx.waitUntil(notifyNewMessage(r.env.DB, r.user.id, chat.title, filtered.text).catch(() => undefined));
        };
        if (streamedText.trim() || clientEvents.length > 0) await persist(streamedText);
        send("done", { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, message_id: assistantMessageId });
        controller.close();
      } catch {
        send("error", { code: "internal", message: "Generation failed. Please try again." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});

export default turn;
