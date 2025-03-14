import * as Sentry from "@sentry/react-native";
import { apiClient } from './apiClient';

export interface PaginatedResponse<T> {
    results: T[];
    next?: string;
    previous?: string;
    count: number;
}

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
    role: string;
    isLoading?: boolean | undefined;
}

export const fetchChat = async (chatId: string): Promise<Chat | null> => {
    try {
        const { data, ok, status } = await apiClient<Chat>(`/chats/${chatId}.json`);
        if (!ok) {
            throw new Error(`Failed to fetch chat with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        Sentry.captureException(error);
        return null;
    }
}

export const fetchChats = async (profileId: string | null, page: number | null): Promise<PaginatedResponse<Chat> | null> => {
    try {
        let endpoint = '/chats.json?1=1';
        if (profileId) {
            endpoint += '&profileId=' + profileId;
        }
        if (page) {
            endpoint += `&page=${page}`;
        }
        const { data, ok, status } = await apiClient<PaginatedResponse<Chat>>(endpoint);

        if (!ok) {
            throw new Error(`Failed to fetch chats with status ${status}`);
        }

        return data;
    }
    catch (error: any) {
        Sentry.captureException(error);
        return { results: [], count: 0 };
    }
};


export const fetchChatMessages = async (chatId: string, page: number | null): Promise<PaginatedResponse<ChatMessage> | null> => {
    try {
        let endpoint = `/chats/${chatId}/messages.json`;
        if (page) {
            endpoint += `?page=${page}`;
        }
        const { data, ok, status } = await apiClient<PaginatedResponse<ChatMessage>>(endpoint);

        if (!ok) {
            throw new Error(`Failed to fetch chat messages with status ${status}`);
        }

        return data;
    }
    catch (error: any) {
        Sentry.captureException(error);
        return { results: [], count: 0 };
    }
}

export interface ChatResponse {
    chat_id: string;
    response: string;
}

export const sendChat = async (
    chatId: string = "new", 
    message: FormData,
): Promise<ChatResponse | null> => {
    try {
        const { data, ok, status } = await apiClient<ChatResponse>(`/chats/${chatId}`, {
            method: 'POST',
            body: message,
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });

        if (!ok) {
            throw new Error(`Failed to send chat with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        Sentry.captureException(error);
        return null;
    }
}