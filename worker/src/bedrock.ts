// Bedrock Converse client (SigV4-signed fetch) — replaces langchain_aws.
// Supports every model in back/back/bots/fixtures/ai_models.json (Nova,
// Llama via Converse). Prompt caching (cachePoint) is intentionally omitted:
// correctness first, documented in the README as a cost follow-up.

import { signRequest } from "./sigv4";
import type { Env } from "./types";

export interface ConverseTextBlock {
  text: string;
}
export interface ConverseToolUseBlock {
  toolUse: { toolUseId: string; name: string; input: unknown };
}
export interface ConverseToolResultBlock {
  toolResult: { toolUseId: string; content: Array<{ text: string } | Record<string, unknown>> };
}
export interface ConverseImageBlock {
  image: { format: string; source: { bytes: string } };
}
export type ConverseContentBlock =
  | ConverseTextBlock
  | ConverseToolUseBlock
  | ConverseToolResultBlock
  | ConverseImageBlock;

export interface ConverseMessage {
  role: "user" | "assistant";
  content: ConverseContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConverseResult {
  content: ConverseContentBlock[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

function endpoint(env: Env, modelId: string): string {
  const region = env.AWS_REGION ?? "us-east-1";
  // Model IDs (and application-inference-profile ARNs) are passed through
  // verbatim, exactly as langchain_aws sent them: encoding would mangle
  // the colons/slashes ARNs contain.
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;
}

function creds(env: Env) {
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
    region: env.AWS_REGION ?? "us-east-1",
    service: "bedrock",
  };
}

export async function converse(
  env: Env,
  modelId: string,
  system: string | null,
  messages: ConverseMessage[],
  tools?: ToolDef[],
  maxTokens?: number,
): Promise<ConverseResult> {
  const body: Record<string, unknown> = {
    messages,
    inferenceConfig: { maxTokens: maxTokens ?? parseInt(env.BEDROCK_MAX_TOKENS ?? "8192", 10) },
  };
  if (system) body["system"] = [{ text: system }];
  if (tools && tools.length > 0) {
    body["toolConfig"] = {
      tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })),
    };
  }
  const payload = JSON.stringify(body);
  const headers = await signRequest(creds(env), "POST", endpoint(env, modelId), { "content-type": "application/json" }, payload);
  const resp = await fetch(endpoint(env, modelId), { method: "POST", headers, body: payload });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`bedrock converse ${resp.status}: ${text.slice(0, 500)}`);
  }
  const json = (await resp.json()) as {
    output?: { message?: { content?: ConverseContentBlock[] } };
    stopReason?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  return {
    content: json.output?.message?.content ?? [],
    stopReason: json.stopReason ?? "end_turn",
    inputTokens: json.usage?.inputTokens ?? 0,
    outputTokens: json.usage?.outputTokens ?? 0,
  };
}

export function blockText(block: ConverseContentBlock): string {
  if (typeof block === "object" && block !== null && "text" in block && typeof (block as { text: unknown }).text === "string") {
    return (block as ConverseTextBlock).text;
  }
  return "";
}

export function messageText(content: ConverseContentBlock[]): string {
  return content.map(blockText).join("").trim();
}
