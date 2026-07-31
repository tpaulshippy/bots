import { request, PaginatedResponse } from './request';

export interface Profile {
    id: number;
    profile_id: string;
    name: string;
    deleted_at: Date | null;
}

export const fetchProfiles = async (): Promise<PaginatedResponse<Profile> | null> =>
    request<PaginatedResponse<Profile> | null>('/profiles.json', {}, { results: [], count: 0 });

export const fetchProfile = async (id: string): Promise<Profile | null> =>
    request<Profile | null>(`/profiles/${id}.json`, {}, null);

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
