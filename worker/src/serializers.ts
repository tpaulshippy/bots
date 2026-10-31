// API shapes — mirror the DRF serializers (bots/serializers/*) field-for-field
// so the Expo app needs no changes. `url` fields use the request origin.

import { toBool, parseJson } from "./db";
import { signMediaUrl } from "./images";
import type { Env } from "./types";

export interface Ctx {
  env: Env;
  base: string; // e.g. https://api.example.com/api
}

const bool = (v: number | null | undefined): boolean => toBool(v ?? 0);

export function profileRow(p: Record<string, unknown>) {
  return {
    id: p["id"],
    profile_id: p["profile_id"],
    name: p["name"],
    oauth_email: p["oauth_email"] ?? null,
    photo_url: (p as { photo_url?: string | null }).photo_url ?? null,
    deleted_at: p["deleted_at"] ?? null,
    created_at: p["created_at"],
    modified_at: p["modified_at"],
  };
}

export function ownProfileRow(p: Record<string, unknown>) {
  return {
    id: p["id"],
    profile_id: p["profile_id"],
    name: p["name"],
    photo_url: (p as { photo_url?: string | null }).photo_url ?? null,
  };
}

export function profileIdNested(p: Record<string, unknown> | null) {
  if (!p) return null;
  return { id: p["id"], profile_id: p["profile_id"], name: p["name"], url: null };
}

export function botRow(b: Record<string, unknown> | null, aiModelId: string | null, url: string | null) {
  if (!b) return null;
  return {
    id: b["id"],
    bot_id: b["bot_id"],
    name: b["name"],
    ai_model: aiModelId ?? null,
    system_prompt: b["system_prompt"] ?? null,
    simple_editor: bool(b["simple_editor"] as number),
    template_name: b["template_name"] ?? null,
    response_length: b["response_length"],
    restrict_adult_topics: bool(b["restrict_adult_topics"] as number),
    restrict_language: bool(b["restrict_language"] as number),
    enable_web_search: bool(b["enable_web_search"] as number),
    enable_html_pages: bool(b["enable_html_pages"] as number),
    color: b["color"] ?? null,
    icon: b["icon"] ?? null,
    created_at: b["created_at"],
    modified_at: b["modified_at"],
    deleted_at: b["deleted_at"] ?? null,
    url,
  };
}

export async function messageRow(c: Ctx, m: Record<string, unknown>) {
  const imageFilename = m["image_filename"] as string | null;
  return {
    id: m["id"],
    chat_id: m["chat_id"],
    message_id: m["message_id"],
    order: m["order"],
    role: m["role"],
    text: m["text"],
    input_tokens: m["input_tokens"],
    output_tokens: m["output_tokens"],
    created_at: m["created_at"],
    modified_at: m["modified_at"],
    image_url: imageFilename ? await signMediaUrl(c.env, imageFilename, c.base.replace(/\/api$/, "")) : null,
    agent_events: parseJson((m["agent_events"] as string) ?? "[]", []),
  };
}

export function deckListRow(d: Record<string, unknown>) {
  return {
    id: d["id"],
    deck_id: d["deck_id"],
    name: d["name"],
    description: d["description"] ?? "",
    card_count: d["flashcard_count"] ?? d["card_count"] ?? 0,
    due_count: d["due_count"] ?? 0,
    last_studied_at: d["last_studied_at"] ?? null,
    created_at: d["created_at"],
    updated_at: d["updated_at"],
  };
}

export async function deckRow(c: Ctx, d: Record<string, unknown>, flashcards: Record<string, unknown>[]) {
  void c;
  return {
    id: d["id"],
    deck_id: d["deck_id"],
    profile: d["profile_slug"] ?? null,
    chat: d["chat_slug"] ?? null,
    name: d["name"],
    description: d["description"] ?? "",
    flashcards: flashcards.map(flashcardRow),
    card_count: flashcards.length,
    due_count: d["due_count"] ?? 0,
    last_studied_at: d["last_studied_at"] ?? null,
    created_at: d["created_at"],
    updated_at: d["updated_at"],
  };
}

export function flashcardRow(f: Record<string, unknown>) {
  return {
    id: f["id"],
    flashcard_id: f["flashcard_id"],
    deck: f["deck_slug"] ?? f["deck_id"] ?? null,
    front: f["front"],
    back: f["back"],
    order: f["order"],
    due_at: f["due_at"] ?? null,
    interval_days: f["interval_days"] ?? 0,
    ease: f["ease"] ?? 2.5,
    reps: f["reps"] ?? 0,
    lapses: f["lapses"] ?? 0,
    last_reviewed_at: f["last_reviewed_at"] ?? null,
    created_at: f["created_at"],
    updated_at: f["updated_at"],
  };
}

export function htmlListRow(h: Record<string, unknown>, base: string) {
  return {
    id: h["id"],
    page_id: h["page_id"],
    title: h["title"],
    raw_url: `/api/html-pages/${h["page_id"]}/raw/`,
    profile_id: h["profile_id_slug"] ?? null,
    profile_name: h["profile_name"] ?? null,
    created_at: h["created_at"],
    updated_at: h["updated_at"],
  };
}

export function htmlDetailRow(h: Record<string, unknown>) {
  return {
    ...htmlListRow(h, ""),
    html: h["html"],
  };
}

export function aiModelRow(m: Record<string, unknown>, url: string | null) {
  return {
    id: m["id"],
    created_at: m["created_at"],
    modified_at: m["modified_at"],
    model_id: m["model_id"],
    name: m["name"],
    input_token_cost: m["input_token_cost"],
    output_token_cost: m["output_token_cost"],
    is_default: bool(m["is_default"] as number),
    url,
  };
}

export function deviceRow(d: Record<string, unknown>, url: string | null) {
  return {
    id: d["id"],
    device_id: d["device_id"],
    notification_token: d["notification_token"],
    notify_on_new_chat: bool(d["notify_on_new_chat"] as number),
    notify_on_new_message: bool(d["notify_on_new_message"] as number),
    notify_digest_only: bool(d["notify_digest_only"] as number),
    notify_study_due: bool(d["notify_study_due"] as number),
    deleted_at: d["deleted_at"] ?? null,
    created_at: d["created_at"],
    modified_at: d["modified_at"],
    url,
  };
}

export function activityChatRow(r: Record<string, unknown>) {
  return {
    chat_id: r["chat_id"],
    title: r["title"],
    profile: r["profile_pk"] ? { profile_id: r["profile_slug"], name: r["profile_name"] } : null,
    bot: r["bot_pk"] ? { bot_id: r["bot_slug"], name: r["bot_name"], color: r["bot_color"], icon: r["bot_icon"] } : null,
    message_count: r["message_count"] ?? 0,
    last_message_preview: r["last_message_preview"] ?? null,
    last_message_at: r["last_message_at"] ?? null,
    safety_event_count: r["safety_event_count"] ?? 0,
  };
}

export function activitySafetyRow(s: Record<string, unknown>) {
  return {
    event_id: s["event_id"],
    stage: s["stage"],
    reason_code: s["reason_code"],
    snippet_redacted: s["snippet_redacted"] ?? "",
    created_at: s["created_at"],
    message_order: s["message_order"] ?? null,
    summary: `Safety flag: ${s["reason_code"] ?? s["stage"]}`,
  };
}
