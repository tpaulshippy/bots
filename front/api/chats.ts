import { apiClient } from './apiClient';

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

export const fetchChats = async (profileId: string | null): Promise<Chat[]> => {

    const { data, ok, status } = await apiClient<Chat[]>('/chats.json');

    if (!ok) {
        throw new Error(`Failed to fetch chats with status ${status}`);
    }

    if (profileId) {
            return data.filter((chat) => chat.profile && chat.profile.profile_id === profileId);
    }

    return data;
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
    profile: string,
    bot: string
    ): Promise<ChatResponse | null> => {
    try {
        const { data, ok, status } = await apiClient<ChatResponse>(`/api/chats/${chatId}`, {
            method: 'POST',
            body: JSON.stringify({ message, profile, bot }),
        });

        if (!ok) {
            throw new Error(`Failed to send chat with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString(), JSON.stringify({ message, profile }));
        return null;
    }
}