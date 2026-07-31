import { request, PaginatedResponse } from "./request";

export interface AiModel {
  id: number;
  model_id: string;
  name: string;
  input_token_cost: number;
  output_token_cost: number;
  is_default: boolean;
}

export const fetchAiModels = async (): Promise<PaginatedResponse<AiModel> | null> =>
  request<PaginatedResponse<AiModel> | null>("/ai_models.json", {}, { results: [], count: 0 });
