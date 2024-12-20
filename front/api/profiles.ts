import { apiClient } from './apiClient';

export interface Profile {
    id: number;
    profile_id: string;
    name: string;
}

export const fetchProfiles = async (): Promise<Profile[]> => {
    try {
        const { data, ok, status } = await apiClient<Profile[]>('/profiles.json');

        if (!ok) {
            throw new Error(`Failed to fetch profiles with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return [];
    }
};
