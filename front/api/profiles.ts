import * as Sentry from "@sentry/react-native";
import { apiClient } from './apiClient';
import { PaginatedResponse } from './chats';

export interface Profile {
    id: number;
    profile_id: string;
    name: string;
    deleted_at: Date | null;
}

export const fetchProfiles = async (): Promise<PaginatedResponse<Profile> | null> => {
    try {
        const { data, ok, status } = await apiClient<PaginatedResponse<Profile>>('/profiles.json');

        if (!ok) {
            throw new Error(`Failed to fetch profiles with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        Sentry.captureException(error);
        return { results: [], count: 0 };
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
        Sentry.captureException(error);
        return null;
    }
}

export const upsertProfile = async (profile: Profile): Promise<Profile | null> => {
    try {
        if (profile.id == -1) {
            const { data, ok, status } = await apiClient<Profile>('/profiles.json', {
                method: 'POST',
                body: JSON.stringify(profile),
            });

            if (!ok) {
                throw new Error(`Failed to create profile with status ${status}`);
            }
            return data;
        }
        const { data, ok, status } = await apiClient<Profile>(`/profiles/${profile.id}.json`, {
            method: 'PUT',
            body: JSON.stringify(profile),
        });

        if (!ok) {
            throw new Error(`Failed to update profile with status ${status}`);
        }
        return data;
    } catch (error: any) {
        Sentry.captureException(error);
        return null;
    }
};
