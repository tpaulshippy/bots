-- Cover the chat-list sort: WHERE user_id = ? ORDER BY modified_at DESC.
-- The per-chat COUNT subqueries are gone (0005 denormalized the count),
-- leaving the user-scoped sort as the remaining scan on every list load
-- (~386 rows for the heaviest user). This turns it into an index seek.
CREATE INDEX IF NOT EXISTS bots_chat_user_modified_idx
  ON bots_chat(user_id, modified_at DESC);
