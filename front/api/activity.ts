import { request, PaginatedResponse } from './request';

export type { PaginatedResponse };

// Row of the parent activity inbox (GET /api/activity/chats/).
export interface ActivityChatItem {
    chat_id: string;
    title: string;
    profile: {
        profile_id: string;
        name: string;
    };
    bot: {
        bot_id: string;
        name: string;
        color: string | null;
        icon: string | null;
    } | null;
    message_count: number;
    last_message_preview: string | null;
    last_message_at: string | null;
    safety_event_count: number;
}

// Read-only transcript (GET /api/activity/chats/{chat_id}/).
export interface ActivityChatDetail extends ActivityChatItem {
    messages: ActivityTranscriptMessage[];
    safety_events: ActivitySafetyEvent[];
}

export interface ActivityTranscriptMessage {
    message_id: string;
    order: number;
    role: string;
    text: string;
    created_at: string;
    image_url: string | null;
}

// Populated once roadmap 03 (SafetyEvent) ships; always empty today.
export interface ActivitySafetyEvent {
    message_order?: number;
    summary?: string;
}

export interface ActivityProfileSummary {
    profile_id: string;
    name: string;
    chat_count: number;
    message_count: number;
    safety_event_count: number;
    top_bots: { name: string; count: number }[];
}

export interface ActivitySummary {
    profiles: ActivityProfileSummary[];
}

const buildQuery = (params: Record<string, string | number | null | undefined>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            search.set(key, String(value));
        }
    }
    const query = search.toString();
    return query ? `?${query}` : '';
};

export const fetchActivityChats = async (
    filters: {
        profileId?: string | null;
        botId?: string | null;
        since?: string | null;
        until?: string | null;
        hasSafetyEvent?: boolean | null;
        page?: number | null;
    } = {}
): Promise<PaginatedResponse<ActivityChatItem> | null> => {
    const query = buildQuery({
        profileId: filters.profileId,
        botId: filters.botId,
        since: filters.since,
        until: filters.until,
        hasSafetyEvent: filters.hasSafetyEvent === true ? 'true' : null,
        page: filters.page,
    });
    return request<PaginatedResponse<ActivityChatItem> | null>(
        `/activity/chats.json${query}`,
        {},
        { results: [], count: 0 }
    );
};

export const fetchActivityChat = async (
    chatId: string
): Promise<ActivityChatDetail | null> =>
    request<ActivityChatDetail | null>(`/activity/chats/${chatId}.json`, {}, null);

export const fetchActivitySummary = async (days = 7): Promise<ActivitySummary | null> =>
    request<ActivitySummary | null>(
        `/activity/summary.json${buildQuery({ days })}`,
        {},
        { profiles: [] }
    );
