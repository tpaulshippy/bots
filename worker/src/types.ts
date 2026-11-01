// Shared Worker types. Mirrors the Django model surface that routes need.

export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  JWT_SECRET: string;
  MEDIA_SIGNING_SECRET?: string;
  APP_DEEP_URL?: string;
  WEB_APP_LOGIN_URL?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_STORAGE_BUCKET_NAME?: string;
  BEDROCK_MAX_TOKENS?: string;
  ALLOW_E2E_FAKE_STREAM?: string;
  MAX_HTML_BYTES?: string;
  TAVILY_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  REVENUECAT_WEBHOOK_AUTH_HEADER?: string;
  RESEND_API_KEY?: string;
  EMAIL_RECIPIENT?: string;
}

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  is_active: number;
}

// Validated JWT payload (SimpleJWT-compatible claims + Syft extensions).
export interface AuthPayload {
  user_id: number;
  token_type: "access" | "refresh";
  exp: number;
  iat: number;
  jti?: string;
  is_teen_delegated?: boolean;
  active_profile_id?: string | null;
  parent_reauth?: boolean;
}

export interface ProfileRow {
  id: number;
  user_id: number | null;
  profile_id: string;
  name: string;
  oauth_email: string | null;
  photo_filename: string | null;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
  chat_count: number;
}

export interface BotRow {
  id: number;
  user_id: number | null;
  ai_model_id: number | null;
  bot_id: string;
  name: string;
  system_prompt: string | null;
  simple_editor: number;
  template_name: string | null;
  response_length: number;
  restrict_language: number;
  restrict_adult_topics: number;
  enable_web_search: number;
  enable_html_pages: number;
  color: string | null;
  icon: string | null;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface ChatRow {
  id: number;
  user_id: number | null;
  profile_id: number | null;
  bot_id: number | null;
  chat_id: string;
  title: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  modified_at: string;
}

export interface MessageRow {
  id: number;
  chat_id: number;
  message_id: string;
  text: string;
  role: string;
  order: number;
  input_tokens: number;
  output_tokens: number;
  model_id: string | null;
  created_at: string;
  modified_at: string;
  image_filename: string | null;
  safety_blocked: number;
  agent_events: string;
}

export const nowIso = (): string => new Date().toISOString();
