// Expo push notifications — port of bots/models/device.py NotificationClient.
// Fire-and-forget via ctx.waitUntil; per-device try/except like Django.
//
// Payload shapes mirror Django exactly: the app's notification handler keys
// off `data.target` ("chat" | "parent_activity" | "study_due") and
// `data.chat_id`, and every message carries `sound: "default"` (silent
// otherwise on iOS).

import type { BotRow, ChatRow, ProfileRow } from "./types";

export interface DeviceRow {
  notification_token: string;
  notify_on_new_chat: number;
  notify_on_new_message: number;
  notify_digest_only: number;
  notify_study_due: number;
}

export interface PushUser {
  id: number;
  first_name: string;
}

export interface PushChat {
  chat: ChatRow;
  bot: BotRow | null;
  profile: ProfileRow | null;
}

export interface PushMessage {
  role: string;
  text: string;
}

interface ExpoMessage {
  to: string;
  sound?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

async function sendBatch(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // best-effort
  }
}

async function devicesForUser(db: D1Database, userId: number): Promise<DeviceRow[]> {
  const res = await db
    .prepare(
      `SELECT notification_token, notify_on_new_chat, notify_on_new_message, notify_digest_only, notify_study_due
       FROM bots_device WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .bind(userId)
    .all<DeviceRow>();
  return res.results ?? [];
}

function fromName(profile: ProfileRow | null, user: PushUser): string {
  return profile?.name || user.first_name || "Someone";
}

function toName(bot: BotRow | null): string {
  return bot?.name ?? "unknown";
}

export async function notifyNewChat(db: D1Database, push: PushChat, user: PushUser): Promise<void> {
  const devices = await devicesForUser(db, user.id);
  const msgs: ExpoMessage[] = [];
  for (const d of devices) {
    try {
      if (d.notify_digest_only === 1 || d.notify_on_new_chat !== 1) continue;
      msgs.push({
        to: d.notification_token,
        sound: "default",
        title: `${fromName(push.profile, user)} started a conversation with ${toName(push.bot)}`,
        body: push.chat.title,
        data: { chat_id: push.chat.chat_id, target: "chat" },
      });
    } catch {
      // per-device isolation like Django
    }
  }
  await sendBatch(msgs);
}

export async function notifyNewMessage(
  db: D1Database,
  message: PushMessage,
  push: PushChat,
  user: PushUser,
): Promise<void> {
  // User turns only: assistant completions and refusals never push
  // (Django's notify_message checks role == 'user' the same way).
  if (message.role !== "user") return;
  const devices = await devicesForUser(db, user.id);
  const msgs: ExpoMessage[] = [];
  for (const d of devices) {
    try {
      if (d.notify_digest_only === 1 || d.notify_on_new_message !== 1) continue;
      msgs.push({
        to: d.notification_token,
        sound: "default",
        title: `${fromName(push.profile, user)} sent ${toName(push.bot)} a message`,
        body: message.text,
        data: { chat_id: push.chat.chat_id, target: "chat" },
      });
    } catch {
      // per-device isolation
    }
  }
  await sendBatch(msgs);
}

// Study reminders and digests are composed by the cron handlers in
// routes/misc.ts (mirroring send_study_reminders / send_activity_digests)
// and delivered unwrapped here.
export async function pushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await sendBatch(tokens.map((to) => ({ to, sound: "default", title, body, data })));
}
