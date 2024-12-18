import { apiClient } from './apiClient';

export interface Chat {
    id: number;
    chat_id: string;
    title: string;
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

export interface ChatResponse {
    chat_id: string;
    response: string;
}

export const sendChat = async (
    chatId: string = "new", 
    message: string): Promise<ChatResponse | null> => {
    try {
        const { data, ok, status } = await apiClient<ChatResponse>(`/api/chats/${chatId}`, {
            method: 'POST',
            body: JSON.stringify({ message }),
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