import * as Sentry from "@sentry/react-native";
import { apiClient, UnauthorizedError } from "./apiClient";
import { PaginatedResponse } from "./chats";

export interface AiModel {
  id: number;
  model_id: string;
  name: string;
  input_token_cost: number;
  output_token_cost: number;
  is_default: boolean;
}

export const fetchAiModels = async (): Promise<PaginatedResponse<AiModel> | null> => {
  try {
    const { data, ok, status } = await apiClient<PaginatedResponse<AiModel>>("/ai_models.json");

    if (!ok) {
      throw new Error(`Failed to fetch AiModels with status ${status}`);
    }
    return data;
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    Sentry.captureException(error);
    return { results: [], count: 0 };
  }
};

