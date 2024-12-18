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