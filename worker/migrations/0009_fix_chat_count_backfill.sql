-- Correct 0008's useraccount recompute, which compared the table to itself
-- (bots_useraccount.user_id = bots_useraccount.user_id — always true) and
-- wrote the table total into every row. This recomputes with the proper
-- correlation. Triggers going forward were already correct; this fixes the
-- bases they increment from. (Profile counts in 0008 correlated correctly.)
UPDATE bots_useraccount
  SET chat_count = (SELECT COUNT(*) FROM bots_chat WHERE bots_chat.user_id = bots_useraccount.user_id);
