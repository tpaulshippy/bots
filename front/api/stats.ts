import { request } from "./request";

export interface StatsDay {
  date: string;
  messages: number;
  reviews: number;
}

export interface ProfileStats {
  profile_id: string;
  name: string;
  current_streak: number;
  longest_streak: number;
  total_chats: number;
  total_messages: number;
  total_reviews: number;
  chatted_today: boolean;
  studied_today: boolean;
  week: StatsDay[];
}

// Gamification stats for one profile, fed by chat + flashcard use.
export const fetchStats = async (
  profileId: string
): Promise<ProfileStats | null> =>
  request<ProfileStats | null>(
    `/stats.json?profileId=${profileId}`,
    { method: "GET" },
    null
  );
