import { AiModel } from "./aiModels";
import { apiClient } from "./apiClient";
import { PaginatedResponse } from "./chats";

export interface Bot {
  id: number;
  bot_id: string;
  name: string;
  ai_model: string;
  system_prompt: string;
  simple_editor: boolean;
  template_name: string;
  response_length: number;
  restrict_language: boolean;
  restrict_adult_topics: boolean;
  deleted_at: Date | null;
}

export const fetchBots = async (): Promise<PaginatedResponse<Bot>> => {
  try {
    const { data, ok, status } = await apiClient<PaginatedResponse<Bot>>("/bots.json");

    if (!ok) {
      throw new Error(`Failed to fetch bots with status ${status}`);
    }
    return data;
  } catch (error: any) {
    console.error(error.toString());
    return { results: [], count: 0 };
  }
};


export const fetchBot = async (id: string): Promise<Bot | null> => {
  try {
    const { data, ok, status } = await apiClient<Bot>(`/bots/${id}.json`);

    if (!ok) {
      throw new Error(`Failed to fetch bot with status ${status}`);
    }
    return data;
  } catch (error: any) {
    console.error(error.toString());
    return null;
  }
};

export const upsertBot = async (bot: Bot): Promise<Bot> => {
  if (bot.id == -1) {
    const { data, ok, status } = await apiClient<Bot>("/bots.json", {
      method: "POST",
      body: JSON.stringify(bot),
    });

    if (!ok) {
      throw new Error(JSON.stringify(data));
    }
    return data;
  }
  const { data, ok, status } = await apiClient<Bot>(`/bots/${bot.id}.json`, {
    method: "PUT",
    body: JSON.stringify(bot),
  });

  if (!ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
};
