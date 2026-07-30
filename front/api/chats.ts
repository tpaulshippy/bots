import { request, PaginatedResponse } from './request';

export type { PaginatedResponse };

export interface Chat {
    id: number;
    chat_id: string;
    title: string;
    modified_at: string;
    messages: ChatMessage[];
    profile: {
        profile_id: string;
    }, 
    bot: {
        name: string;
        bot_id: string;
    }
}

export interface ChatMessage {
    text: string;
    image_url: string | null;
    role: string;
    isLoading?: boolean | undefined;
}

export const fetchChat = async (chatId: string): Promise<Chat | null> =>
    request<Chat | null>(`/chats/${chatId}.json`, {}, null);

export const fetchChats = async (profileId: string | null, page: number | null): Promise<PaginatedResponse<Chat> | null> => {
    let endpoint = '/chats.json?1=1';
    if (profileId) {
        endpoint += '&profileId=' + profileId;
    }
    if (page) {
        endpoint += `&page=${page}`;
    }
    return request<PaginatedResponse<Chat> | null>(endpoint, {}, { results: [], count: 0 });
};


export const fetchChatMessages = async (chatId: string, page: number | null): Promise<PaginatedResponse<ChatMessage> | null> => {
    let endpoint = `/chats/${chatId}/messages.json`;
    if (page) {
        endpoint += `?page=${page}`;
    }
    return request<PaginatedResponse<ChatMessage> | null>(endpoint, {}, { results: [], count: 0 });
}

export interface ChatResponse {
    chat_id: string;
    response: string;
}

export const sendChat = async (
    chatId: string = "new", 
    message: FormData,
): Promise<ChatResponse | null> =>
    request<ChatResponse | null>(`/chats/${chatId}`, {
        method: 'POST',
        body: message,
    }, null);
