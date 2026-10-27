-- D1 schema: port of back/ Django models (see worker/README.md for mapping).
-- Conventions: datetimes are UTC ISO-8601 TEXT (YYYY-MM-DDTHH:MM:SS.sssZ),
-- booleans are INTEGER 0/1, JSON columns are TEXT, UUIDs are TEXT.
-- Table/column names match Django defaults so the migration script can copy
-- back/db.sqlite3 rows verbatim (after datetime normalization).

CREATE TABLE auth_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password TEXT NOT NULL,
  last_login TEXT,
  is_superuser INTEGER NOT NULL DEFAULT 0,
  username TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  is_staff INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  date_joined TEXT NOT NULL
);

CREATE TABLE bots_aimodel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  input_token_cost REAL NOT NULL DEFAULT 1.0,
  output_token_cost REAL NOT NULL DEFAULT 1.0,
  is_default INTEGER NOT NULL DEFAULT 0,
  supported_input_modalities TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE UNIQUE INDEX unique_default_model ON bots_aimodel(is_default) WHERE is_default = 1;

CREATE TABLE bots_bot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
  ai_model_id INTEGER REFERENCES bots_aimodel(id) ON DELETE SET NULL,
  bot_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  system_prompt TEXT,
  simple_editor INTEGER NOT NULL DEFAULT 0,
  template_name TEXT,
  response_length INTEGER NOT NULL DEFAULT 200,
  restrict_language INTEGER NOT NULL DEFAULT 1,
  restrict_adult_topics INTEGER NOT NULL DEFAULT 1,
  enable_web_search INTEGER NOT NULL DEFAULT 0,
  enable_html_pages INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  icon TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE INDEX bots_bot_user_id_idx ON bots_bot(user_id);

CREATE TABLE bots_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  oauth_email TEXT,
  photo_filename TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE INDEX profile_oauth_email_idx ON bots_profile(oauth_email);
CREATE UNIQUE INDEX unique_active_profile_oauth_email ON bots_profile(oauth_email)
  WHERE oauth_email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE bots_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bots_profile(id) ON DELETE CASCADE,
  bot_id INTEGER REFERENCES bots_bot(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);
CREATE INDEX bots_chat_user_id_idx ON bots_chat(user_id);

CREATE TABLE bots_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES bots_chat(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  "order" INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  image_filename TEXT,
  safety_blocked INTEGER NOT NULL DEFAULT 0,
  agent_events TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX bots_message_model_id_idx ON bots_message(model_id);
CREATE INDEX bots_message_chat_id_idx ON bots_message(chat_id);

CREATE TABLE bots_device (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE,
  notification_token TEXT NOT NULL UNIQUE,
  notify_on_new_chat INTEGER NOT NULL DEFAULT 0,
  notify_on_new_message INTEGER NOT NULL DEFAULT 1,
  notify_digest_only INTEGER NOT NULL DEFAULT 0,
  notify_study_due INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE TABLE bots_deck (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id TEXT NOT NULL UNIQUE,
  profile_id INTEGER NOT NULL REFERENCES bots_profile(id) ON DELETE CASCADE,
  chat_id INTEGER REFERENCES bots_chat(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bots_flashcard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flashcard_id TEXT NOT NULL UNIQUE,
  deck_id INTEGER NOT NULL REFERENCES bots_deck(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0 CHECK ("order" >= 0),
  due_at TEXT,
  interval_days REAL NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  reps INTEGER NOT NULL DEFAULT 0 CHECK (reps >= 0),
  lapses INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bots_flashcard_deck_order_idx ON bots_flashcard(deck_id, "order");

CREATE TABLE bots_flashcardreview (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flashcard_id INTEGER NOT NULL REFERENCES bots_flashcard(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES bots_profile(id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
CREATE INDEX bots_flashcardreview_profile_time_idx ON bots_flashcardreview(profile_id, reviewed_at);
CREATE INDEX bots_flashcardreview_card_time_idx ON bots_flashcardreview(flashcard_id, reviewed_at DESC);

CREATE TABLE bots_htmlpage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL UNIQUE,
  profile_id INTEGER NOT NULL REFERENCES bots_profile(id) ON DELETE CASCADE,
  chat_id INTEGER REFERENCES bots_chat(id) ON DELETE SET NULL,
  bot_id INTEGER REFERENCES bots_bot(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bots_safetyevent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES auth_user(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES bots_profile(id) ON DELETE SET NULL,
  chat_id INTEGER REFERENCES bots_chat(id) ON DELETE SET NULL,
  bot_id INTEGER REFERENCES bots_bot(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES bots_message(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  snippet_redacted TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE bots_useraccount (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
  pin_hash TEXT,
  pin_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (pin_failed_attempts >= 0),
  pin_locked_until TEXT,
  subscription_level INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarding_completed_at TEXT,
  usage_reset_version INTEGER NOT NULL DEFAULT 1,
  usage_reset_pricing TEXT,
  usage_reset_at TEXT,
  usage_reset_timezone TEXT,
  usage_reset_cost REAL NOT NULL DEFAULT 0.0,
  usage_reset_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_reset_output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bots_usagelimithit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_account_id INTEGER NOT NULL REFERENCES bots_useraccount(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  subscription_level INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bots_revenuecatwebhookevent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_event TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Worker-owned: social login linkage (replaces allauth account/socialaccount
-- tables, which are not migrated — see scripts/migrate-from-sqlite.mjs).
CREATE TABLE oauth_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (provider, subject)
);
CREATE INDEX oauth_account_user_idx ON oauth_account(user_id);

-- Worker-owned: short-lived OAuth state for the /api/login/web flow.
CREATE TABLE oauth_state (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL
);
