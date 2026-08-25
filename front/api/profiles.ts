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

// ---- roadmap-09: per-profile access & schedule ----

export interface ProfileAccess {
    access_mode: 'all' | 'allowlist';
    bot_ids: string[];
}

export interface ScheduleWindow {
    dow: number;   // 0=Sun … 6=Sat
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
}

export interface ProfileSchedule {
    enabled: boolean;
    windows: ScheduleWindow[];
    block_message: string;
}

export const fetchProfileAccess = async (profileId: string): Promise<ProfileAccess | null> =>
    request<ProfileAccess | null>(`/profiles/${profileId}/access/`, {}, null);

export const updateProfileAccess = async (
    profileId: string,
    access: ProfileAccess,
): Promise<ProfileAccess | null> =>
    request<ProfileAccess | null>(`/profiles/${profileId}/access/`, {
        method: 'PATCH',
        body: JSON.stringify(access),
    }, null);

export const fetchProfileSchedule = async (profileId: string): Promise<ProfileSchedule | null> =>
    request<ProfileSchedule | null>(`/profiles/${profileId}/schedule/`, {}, null);

export const updateProfileSchedule = async (
    profileId: string,
    schedule: ProfileSchedule,
): Promise<ProfileSchedule | null> =>
    request<ProfileSchedule | null>(`/profiles/${profileId}/schedule/`, {
        method: 'PATCH',
        body: JSON.stringify(schedule),
    }, null);
