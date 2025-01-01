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

export const fetchProfile = async (id: string): Promise<Profile | null> => {
    try {
        const { data, ok, status } = await apiClient<Profile>(`/profiles/${id}.json`);

        if (!ok) {
            throw new Error(`Failed to fetch profile with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return null;
    }
}

export const upsertProfile = async (profile: Profile): Promise<Profile> => {
    if (profile.id == -1) {
        const { data, ok, status } = await apiClient<Profile>('/profiles.json', {
            method: 'POST',
            body: JSON.stringify(profile),
        });

        if (!ok) {
            throw new Error(JSON.stringify(data));
        }
        return data;
    }
    const { data, ok, status } = await apiClient<Profile>(`/profiles/${profile.id}.json`, {
        method: 'PUT',
        body: JSON.stringify(profile),
    });

    if (!ok) {
        throw new Error(JSON.stringify(data));
    }
    return data;
};
