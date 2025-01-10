import { apiClient } from "./apiClient";
import { PaginatedResponse } from "./chats";

export interface AiModel {
  id: number;
  model_id: string;
  name: string;
  input_token_cost: number;
  output_token_cost: number;
  is_default: boolean;
}

export const fetchAiModels = async (): Promise<PaginatedResponse<AiModel>> => {
  try {
    const { data, ok, status } = await apiClient<PaginatedResponse<AiModel>>("/ai_models.json");

    if (!ok) {
      throw new Error(`Failed to fetch AiModels with status ${status}`);
    }
    return data;
  } catch (error: any) {
    console.error(error.toString());
    return { results: [], count: 0 };
  }
};

