-- Second index pass (see 0003 for the chat-list one). bots_profile(user_id)
-- is the most-filtered unindexed column in the codebase (~20 query sites:
-- profile lists, per-chat profile lookups, onboarding, OAuth, decks,
-- htmlpages) — every one currently full-scans bots_profile. deck(profile_id)
-- backs the deck list join + name-uniqueness check. Device indexes are
-- growth insurance: register runs on every app launch (device_id lookup)
-- and pushes resolve by notification_token; both tables are tiny today.
CREATE INDEX IF NOT EXISTS bots_profile_user_idx
  ON bots_profile(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS bots_deck_profile_idx
  ON bots_deck(profile_id);
CREATE INDEX IF NOT EXISTS bots_device_token_idx
  ON bots_device(notification_token);
CREATE INDEX IF NOT EXISTS bots_device_device_id_idx
  ON bots_device(device_id);
