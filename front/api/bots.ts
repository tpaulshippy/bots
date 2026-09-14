import { request, requestRaw, PaginatedResponse } from "./request";
import { UnauthorizedError } from "./apiClient";

export interface Bot {
  id: number;
  bot_id: string;
  name: string;
  ai_model: string;
  system_prompt: string;
  simple_editor: boolean;
  template_name: string | null;
  response_length: number;
  restrict_language: boolean;
  restrict_adult_topics: boolean;
  enable_web_search: boolean;
  enable_html_pages?: boolean;
  color: string | null;
  icon: string | null;
  deleted_at: Date | null;
}

export const fetchBots = async (): Promise<PaginatedResponse<Bot> | null> =>
  request<PaginatedResponse<Bot> | null>("/bots.json", {}, null);


export const fetchBot = async (id: string): Promise<Bot | null> =>
  request<Bot | null>(`/bots/${id}.json`, {}, null);

/** Failure-distinguishing single-bot lookup for selection repair.
 *  Resolves the bot, 'missing' on a confirmed absence, or null when the
 *  lookup couldn't run (offline, denied-list, 5xx). Auth errors propagate
 *  so expired sessions still reach the login redirect instead of looking
 *  like an unverifiable selection. fetchBot resolves null for all of
 *  these, which repair logic must not conflate — clearing the selection
 *  on a transient failure would strand the user with no bot.
 *
 *  Absence is 404 (no such row) or 403: the detail view loads unscoped
 *  rows and IsOwner rejects foreign ones, so 403 means "another
 *  account's bot". Same-account teen sessions authenticate as the parent
 *  user, so their family bots still resolve 200 here. */
export const tryFetchBot = async (
  id: string
): Promise<Bot | 'missing' | null> => {
  let response;
  try {
    response = await requestRaw<Bot>(`/bots/${id}.json`);
  } catch (error: any) {
    if (
      error?.name === 'UnauthorizedError' ||
      (typeof UnauthorizedError === 'function' &&
        error instanceof UnauthorizedError)
    ) {
      throw error;
    }
    return null;
  }
  if (!response) {
    return null;
  }
  if (response.ok) {
    return response.data ?? null;
  }
  return response.status === 404 || response.status === 403
    ? 'missing'
    : null;
};

export const upsertBot = async (bot: Bot): Promise<Bot | null> => {
  if (bot.id === -1) {
    return request<Bot | null>("/bots.json", {
      method: "POST",
      body: JSON.stringify(bot),
    }, null);
  }
  return request<Bot | null>(`/bots/${bot.id}.json`, {
    method: "PUT",
    body: JSON.stringify(bot),
  }, null);
};
