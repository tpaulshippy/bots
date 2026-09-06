import { request, requestRaw, PaginatedResponse } from './request';
import { UnauthorizedError } from './apiClient';

export interface Profile {
    id: number;
    profile_id: string;
    name: string;
    oauth_email?: string | null;
    deleted_at: Date | null;
}

export const fetchProfiles = async (): Promise<PaginatedResponse<Profile> | null> =>
    request<PaginatedResponse<Profile> | null>('/profiles.json', {}, { results: [], count: 0 });

export const fetchProfile = async (id: string): Promise<Profile | null> =>
    request<Profile | null>(`/profiles/${id}.json`, {}, null);

/**
 * Read-self endpoint for teen-delegated sessions: returns only the profile
 * this session is locked to, redacted by the backend.
 */
export const fetchOwnProfile = async (): Promise<Profile | null> => {
    try {
        const response = await requestRaw<Profile>('/profiles/self.json');
        return response?.ok ? response.data ?? null : null;
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            throw error;
        }
        return null;
    }
};

export const upsertProfile = async (profile: Profile): Promise<Profile | null> => {
    if (profile.id === -1) {
        return request<Profile | null>('/profiles.json', {
            method: 'POST',
            body: JSON.stringify(profile),
        }, null);
    }
    return request<Profile | null>(`/profiles/${profile.id}.json`, {
        method: 'PUT',
        body: JSON.stringify(profile),
    }, null);
};
