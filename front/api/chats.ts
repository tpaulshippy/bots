import { apiClient } from './apiClient';

export interface Chat {
    id: number;
    chat_id: string;
    title: string;
    modified_at: string;
    messages: ChatMessage[];
}

export interface ChatMessage {
    text: string;
    role: string;
}

export const fetchChats = async (): Promise<Chat[]> => {
    try {
        const { data, ok, status } = await apiClient<Chat[]>('/chats.json');

        if (!ok) {
            throw new Error(`Failed to fetch chats with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return [];
    }
};


export const fetchChatMessages = async (chatId: string): Promise<ChatMessage[]> => {
    try {
        const { data, ok, status } = await apiClient<Chat>(`/chats/${chatId}.json`);

        if (!ok) {
            throw new Error(`Failed to fetch chat messages with status ${status}`);
        }

        // filter out system messages
        data.messages = data.messages.filter((message) => message.role !== 'system');

        return data.messages;
    }
    catch (error: any) {
        console.error(error.toString());
        return [];
    }
}

export interface ChatResponse {
    chat_id: string;
    response: string;
}

export const sendChat = async (
    chatId: string = "new", 
    message: string,
    profile: string
    ): Promise<ChatResponse | null> => {
    try {
        const { data, ok, status } = await apiClient<ChatResponse>(`/api/chats/${chatId}`, {
            method: 'POST',
            body: JSON.stringify({ message, profile }),
        });

        if (!ok) {
            throw new Error(`Failed to send chat with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return null;
    }
}