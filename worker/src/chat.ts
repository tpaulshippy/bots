// Turn orchestration — port of Chat.get_response/stream_response
// (back/bots/models/chat.py) on top of the agent in agent.ts.

import { buildSystemPrompt, buildTurnContext, pageCatalog, type TurnContext } from "./agent";
import type { ConverseMessage } from "./bedrock";
import { first, fromBool, run } from "./db";
import { newUuid } from "./crypto";
import { getObjectBytes } from "./images";
import {
  evaluateText,
  policyForBot,
  recordSafetyEvent,
  refusalForVerdict,
  STAGE_INPUT,
  type SafetyVerdict,
} from "./safety";
import { overLimit } from "./usage";
import { nowIso, type BotRow, type ChatRow, type Env, type MessageRow, type ProfileRow } from "./types";

export const OVER_LIMIT_MESSAGE = "You have exceeded your daily limit. Please try again tomorrow or upgrade your subscription.";

export interface ChatGraph {
  chat: ChatRow;
  bot: BotRow | null;
  profile: ProfileRow | null;
  aiModelId: string | null;
  defaultModelId: string | null;
  imageModalities: string[];
}

export async function loadChatGraph(db: D1Database, chatId: number): Promise<ChatGraph | null> {
  const chat = await first<ChatRow>(db, "SELECT * FROM bots_chat WHERE id = ?", chatId);
  if (!chat) return null;
  const bot = chat.bot_id ? await first<BotRow>(db, "SELECT * FROM bots_bot WHERE id = ?", chat.bot_id) : null;
  const profile = chat.profile_id ? await first<ProfileRow>(db, "SELECT * FROM bots_profile WHERE id = ?", chat.profile_id) : null;
  const aiModel = bot?.ai_model_id ? await first<{ model_id: string; supported_input_modalities: string }>(
    db,
    "SELECT model_id, supported_input_modalities FROM bots_aimodel WHERE id = ?",
    bot.ai_model_id,
  ) : null;
  const defModel = await first<{ model_id: string; supported_input_modalities: string }>(
    db,
    "SELECT model_id, supported_input_modalities FROM bots_aimodel WHERE is_default = 1",
  );
  let imageModalities: string[] = [];
  try {
    imageModalities = JSON.parse(aiModel?.supported_input_modalities ?? defModel?.supported_input_modalities ?? "[]");
  } catch {
    imageModalities = [];
  }
  return {
    chat,
    bot,
    profile,
    aiModelId: aiModel?.model_id ?? null,
    defaultModelId: defModel?.model_id ?? null,
    imageModalities,
  };
}

// Last 10 non-system, non-blocked messages, oldest first. Assistant rows only
// kept after a user message (Django parity: history must start with user).
export async function buildHistory(db: D1Database, env: Env, chatId: number): Promise<{ history: ConverseMessage[]; containsImage: boolean }> {
  const rows = await db
    .prepare(
      "SELECT * FROM bots_message WHERE chat_id = ? AND role != 'system' AND safety_blocked = 0 ORDER BY id DESC LIMIT 10",
    )
    .bind(chatId)
    .all<MessageRow>();
  const ordered = [...(rows.results ?? [])].sort((a, b) => a.id - b.id);
  const history: ConverseMessage[] = [];
  let containsImage = false;
  for (const m of ordered) {
    if (m.role === "user") {
      const content: ConverseMessage["content"] = [{ text: m.text }];
      if (m.image_filename) {
        containsImage = true;
        try {
          const obj = await getObjectBytes(env, m.image_filename);
          if (obj) {
            const b64 = BufferToB64(obj.bytes);
            const ext = m.image_filename.split(".").pop()?.toLowerCase();
            const format = ext === "png" ? "png" : ext === "gif" ? "gif" : ext === "webp" ? "webp" : "jpeg";
            content.push({ image: { format, source: { bytes: b64 } } });
          }
        } catch {
          // image unavailable: text-only fallback like a failed S3 read
        }
      }
      history.push({ role: "user", content });
    } else if (m.role === "assistant" && history.length > 0) {
      history.push({ role: "assistant", content: [{ text: m.text }] });
    }
  }
  return { history, containsImage };
}

function BufferToB64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  const CHUNK = 8192;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function resolveModelId(graph: ChatGraph): string {
  if (graph.aiModelId) return graph.aiModelId;
  if (!graph.defaultModelId) throw new Error("No default AI model configured in the system");
  return graph.defaultModelId;
}

// Input safety before quota/model setup. Returns the refusal when the latest
// user turn is blocked (persisting the block + assistant refusal), else null.
export async function inputRefusal(
  db: D1Database,
  env: Env,
  graph: ChatGraph,
  userMessageId: number,
  assistantMessageId?: string,
): Promise<string | null> {
  const policy = policyForBot(graph.bot);
  const subject = await first<MessageRow>(db, "SELECT * FROM bots_message WHERE id = ?", userMessageId);
  if (!subject) return null;
  const verdict = await evaluateText(subject.text, policy, env.OPENAI_API_KEY ?? "", "INPUT");
  if (!verdict.blocked) return null;
  const refusal = refusalForVerdict(verdict);
  const now = nowIso();
  if (subject.safety_blocked !== 1) {
    await run(db, "UPDATE bots_message SET safety_blocked = 1, modified_at = ? WHERE id = ?", now, subject.id);
  }
  const orderRow = await first<{ message_count: number }>(db, "SELECT message_count FROM bots_chat WHERE id = ?", graph.chat.id);
  await run(
    db,
    "INSERT INTO bots_message (chat_id, message_id, text, role, \"order\", created_at, modified_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?)",
    graph.chat.id,
    assistantMessageId ?? newUuid(),
    refusal,
    orderRow?.message_count ?? 0,
    now,
    now,
  );
  const assistantRow = await first<{ id: number }>(
    db,
    "SELECT id FROM bots_message WHERE chat_id = ? ORDER BY id DESC",
    graph.chat.id,
  );
  await recordSafetyEvent(
    db,
    STAGE_INPUT,
    verdict,
    { userId: graph.chat.user_id, profileId: graph.profile?.id ?? graph.chat.profile_id, chatId: graph.chat.id, botId: graph.bot?.id ?? graph.chat.bot_id, messageId: subject.id },
    subject.text,
  );
  void assistantRow;
  return refusal;
}

export async function createUserMessage(
  db: D1Database,
  chatId: number,
  text: string,
  imageFilename: string | null,
): Promise<MessageRow> {
  const now = nowIso();
  const orderRow = await first<{ message_count: number }>(db, "SELECT message_count FROM bots_chat WHERE id = ?", chatId);
  const messageId = newUuid();
  await run(
    db,
    "INSERT INTO bots_message (chat_id, message_id, text, role, \"order\", image_filename, created_at, modified_at) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)",
    chatId,
    messageId,
    text ?? "",
    orderRow?.message_count ?? 0,
    imageFilename,
    now,
    now,
  );
  return (await first<MessageRow>(db, "SELECT * FROM bots_message WHERE message_id = ?", messageId))!;
}

export async function persistAssistantMessage(
  db: D1Database,
  graph: ChatGraph,
  text: string,
  usage: { input_tokens: number; output_tokens: number },
  agentEventsJson: string,
  modelId: string | null,
  messageId?: string,
): Promise<MessageRow> {
  const now = nowIso();
  const orderRow = await first<{ message_count: number }>(db, "SELECT message_count FROM bots_chat WHERE id = ?", graph.chat.id);
  const mid = messageId ?? newUuid();
  await run(
    db,
    "INSERT INTO bots_message (chat_id, message_id, text, role, \"order\", input_tokens, output_tokens, agent_events, model_id, created_at, modified_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)",
    graph.chat.id,
    mid,
    text,
    orderRow?.message_count ?? 0,
    usage.input_tokens,
    usage.output_tokens,
    agentEventsJson,
    modelId,
    now,
    now,
  );
  await run(
    db,
    "UPDATE bots_chat SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, modified_at = ? WHERE id = ?",
    usage.input_tokens,
    usage.output_tokens,
    now,
    graph.chat.id,
  );
  return (await first<MessageRow>(db, "SELECT * FROM bots_message WHERE message_id = ?", mid))!;
}

export function makeTurnContext(env: Env, db: D1Database, graph: ChatGraph, modelId: string): TurnContext {
  return buildTurnContext(env, db, graph.chat, graph.bot, graph.profile, modelId);
}

export async function resolveModelForTurn(graph: ChatGraph, containsImage: boolean): Promise<string> {
  if (
    containsImage &&
    graph.bot?.ai_model_id &&
    !graph.imageModalities.includes("image")
  ) {
    if (!graph.defaultModelId) throw new Error("No default AI model configured in the system");
    return graph.defaultModelId;
  }
  return resolveModelId(graph);
}

export async function prepareSystemAndHistory(
  env: Env,
  db: D1Database,
  graph: ChatGraph,
): Promise<{ system: string; history: ConverseMessage[]; containsImage: boolean }> {
  const { history, containsImage } = await buildHistory(db, env, graph.chat.id);
  const system = buildSystemPrompt(graph.bot, env.TAVILY_API_KEY ?? "");
  const catalog = await pageCatalog(
    db,
    buildTurnContext(env, db, graph.chat, graph.bot, graph.profile, graph.aiModelId ?? graph.defaultModelId ?? ""),
  );
  return { system: catalog && system ? `${system}\n\n${catalog}` : catalog ?? system, history, containsImage };
}

export async function applyOutputFilter(
  db: D1Database,
  env: Env,
  graph: ChatGraph,
  text: string,
): Promise<{ text: string; flagged: string | null; verdict: SafetyVerdict | null }> {
  // Pure filter: evaluates and substitutes the refusal but does NOT record.
  // Callers persist first, then record once with the assistant row id, so
  // the parent inbox links to the saved message (Django wrote one row).
  const policy = policyForBot(graph.bot);
  const verdict = await evaluateText(text, policy, env.OPENAI_API_KEY ?? "", "OUTPUT");
  if (!verdict.blocked) return { text, flagged: null, verdict: null };
  return { text: refusalForVerdict(verdict), flagged: text, verdict };
}

