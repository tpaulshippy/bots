-- Speed up the chat-list query (activity.ts): four correlated subqueries per
-- chat scan bots_message/bots_safetyevent on every list load (refetched on
-- each navigation). A few minutes of browsing cost ~37k D1 row reads.
-- These indexes turn the per-chat preview/timestamp/safety lookups into
-- index seeks. Message counts still scan the chat's own messages (bounded,
-- typically small); full denormalization onto bots_chat is a later step.
CREATE INDEX IF NOT EXISTS bots_message_chat_created_idx
  ON bots_message(chat_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS bots_safetyevent_chat_idx
  ON bots_safetyevent(chat_id);
