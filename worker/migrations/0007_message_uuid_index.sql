-- Per-message sends were full-scanning bots_message (3.5k rows and growing):
-- every lookup by the public message UUID had no index, and the next
-- "order" value was computed with COUNT(*) per insert. The UUID is unique;
-- ordering now reuses the denormalized bots_chat.message_count (0005).
CREATE UNIQUE INDEX IF NOT EXISTS bots_message_uuid_idx
  ON bots_message(message_id);
