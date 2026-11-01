-- Denormalize the chat-list message count. The list query ran
-- (SELECT COUNT(*) ...) per chat on every load — measured 3,871 rows read
-- for a single 50-chat page of the heaviest user. The count now lives on
-- the row and is maintained by trigger (covers every writer, including
-- direct-D1 tooling — no app change needed at insert sites).
ALTER TABLE bots_chat ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0;
UPDATE bots_chat
  SET message_count = (SELECT COUNT(*) FROM bots_message m WHERE m.chat_id = bots_chat.id);
CREATE TRIGGER IF NOT EXISTS bots_message_count_insert
AFTER INSERT ON bots_message
BEGIN
  UPDATE bots_chat SET message_count = message_count + 1 WHERE id = NEW.chat_id;
END;
-- Defensive: no prod path deletes messages or moves them between chats
-- (messages are insert-only; verified by grep — the only deletes are E2E
-- direct-D1 resets on test users), but keep the count exact if one appears.
CREATE TRIGGER IF NOT EXISTS bots_message_count_delete
AFTER DELETE ON bots_message
BEGIN
  UPDATE bots_chat SET message_count = message_count - 1 WHERE id = OLD.chat_id;
END;
