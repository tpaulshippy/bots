import { apiClient } from './apiClient';

export interface Bot {
    id: number;
    bot_id: string;
    name: string;
}

export const fetchBots = async (): Promise<Bot[]> => {
    try {
        const { data, ok, status } = await apiClient<Bot[]>('/bots.json');

        if (!ok) {
            throw new Error(`Failed to fetch bots with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return [];
    }
};
