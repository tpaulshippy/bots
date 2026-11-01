-- Denormalize the chat-list pagination total. The unfiltered list COUNT(*)
-- rescans all of the user's chats (~389 rows for the heaviest user) on
-- every load, including every refetch — it is now the biggest per-visit
-- line item. bots_useraccount already has one row per user, so the count
-- lives there, maintained by trigger (covers all writers).
ALTER TABLE bots_useraccount ADD COLUMN chat_count INTEGER NOT NULL DEFAULT 0;
UPDATE bots_useraccount
  SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.user_id = bots_useraccount.user_id);
CREATE TRIGGER IF NOT EXISTS bots_chat_count_insert
AFTER INSERT ON bots_chat
BEGIN
  UPDATE bots_useraccount SET chat_count = chat_count + 1 WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS bots_chat_count_delete
AFTER DELETE ON bots_chat
BEGIN
  UPDATE bots_useraccount SET chat_count = chat_count - 1 WHERE user_id = OLD.user_id;
END;
