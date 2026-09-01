import { request, PaginatedResponse } from "./request";

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
  color: string | null;
  icon: string | null;
  deleted_at: Date | null;
}

export const fetchBots = async (): Promise<PaginatedResponse<Bot> | null> =>
  request<PaginatedResponse<Bot> | null>("/bots.json", {}, null);


export const fetchBot = async (id: string): Promise<Bot | null> =>
  request<Bot | null>(`/bots/${id}.json`, {}, null);

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
