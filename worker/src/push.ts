// Expo push notifications — port of bots/models/device.py NotificationClient.
// Fire-and-forget via ctx.waitUntil; per-device try/except like Django.

export interface DeviceRow {
  notification_token: string;
  notify_on_new_chat: number;
  notify_on_new_message: number;
  notify_digest_only: number;
  notify_study_due: number;
}

interface ExpoMessage {
  to: string;
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

export async function notifyNewChat(db: D1Database, userId: number, chatTitle: string): Promise<void> {
  const devices = await devicesForUser(db, userId);
  const msgs: ExpoMessage[] = [];
  for (const d of devices) {
    try {
      if (d.notify_digest_only === 1 || d.notify_on_new_chat !== 1) continue;
      msgs.push({ to: d.notification_token, title: "New chat started", body: chatTitle, data: { type: "new_chat" } });
    } catch {
      // per-device isolation like Django
    }
  }
  await sendBatch(msgs);
}

export async function notifyNewMessage(db: D1Database, userId: number, chatTitle: string, preview: string): Promise<void> {
  const devices = await devicesForUser(db, userId);
  const msgs: ExpoMessage[] = [];
  for (const d of devices) {
    try {
      if (d.notify_digest_only === 1 || d.notify_on_new_message !== 1) continue;
      msgs.push({ to: d.notification_token, title: chatTitle, body: preview.slice(0, 100), data: { type: "new_message" } });
    } catch {
      // per-device isolation
    }
  }
  await sendBatch(msgs);
}

export async function pushToTokens(tokens: string[], title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  await sendBatch(tokens.map((to) => ({ to, title, body, data })));
}
