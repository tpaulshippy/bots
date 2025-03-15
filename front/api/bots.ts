import * as Sentry from "@sentry/react-native";
import { apiClient, UnauthorizedError } from "./apiClient";
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

export const fetchBots = async (): Promise<PaginatedResponse<Bot> | null> => {
  try {
    const { data, ok, status } = await apiClient<PaginatedResponse<Bot>>("/bots.json");

    if (!ok) {
      throw new Error(`Failed to fetch bots with status ${status}`);
    }
    return data;
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
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
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
  }
};

export const upsertBot = async (bot: Bot): Promise<Bot | null> => {
  try {
    if (bot.id == -1) {
      const { data, ok, status } = await apiClient<Bot>("/bots.json", {
        method: "POST",
        body: JSON.stringify(bot),
      });

      if (!ok) {
        throw new Error(`Failed to create bot with status ${status}`);
      }
      return data;
    }
    const { data, ok, status } = await apiClient<Bot>(`/bots/${bot.id}.json`, {
      method: "PUT",
      body: JSON.stringify(bot),
    });

    if (!ok) {
      throw new Error(`Failed to update bot with status ${status}`);
    }
    return data;
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return null;
  }
};
