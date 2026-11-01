-- Denormalize the chat-list pagination total. The unfiltered list COUNT(*)
-- rescans all of the user's chats (~389 rows for the heaviest user) on
-- every load, including every refetch — it is now the biggest per-visit
-- line item. bots_useraccount already has one row per user, so the count
-- lives there, maintained by trigger (covers all writers).
ALTER TABLE bots_useraccount ADD COLUMN chat_count INTEGER NOT NULL DEFAULT 0;
UPDATE bots_useraccount
  SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.user_id = bots_useraccount.user_id);
-- Repair any drift first (e.g. OAuth users provisioned before 0008, whose
-- starter chat fired the trigger with no account row present): ensure every
-- chat owner has an account row, then recompute all counts from scratch.
INSERT INTO bots_useraccount (user_id, chat_count)
  SELECT DISTINCT user_id, 0 FROM bots_chat
  WHERE NOT EXISTS (SELECT 1 FROM bots_useraccount WHERE bots_useraccount.user_id = bots_chat.user_id);
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
-- Per-profile counts: the app always scopes the chat list to the selected
-- profile, so the unfiltered per-user fast path rarely fires. Same pattern.
ALTER TABLE bots_profile ADD COLUMN chat_count INTEGER NOT NULL DEFAULT 0;
UPDATE bots_profile
  SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.profile_id = bots_profile.id);
CREATE TRIGGER IF NOT EXISTS bots_profile_chat_count_insert
AFTER INSERT ON bots_chat
BEGIN
  UPDATE bots_profile SET chat_count = chat_count + 1 WHERE id = NEW.profile_id;
END;
CREATE TRIGGER IF NOT EXISTS bots_profile_chat_count_delete
AFTER DELETE ON bots_chat
BEGIN
  UPDATE bots_profile SET chat_count = chat_count - 1 WHERE id = OLD.profile_id;
END;
