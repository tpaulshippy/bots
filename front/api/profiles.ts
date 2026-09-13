import { request, requestRaw, PaginatedResponse } from './request';
import { ApiResponse, UnauthorizedError } from './apiClient';
import type { FieldErrorBody } from './fieldErrors';

export interface Profile {
    id: number;
    profile_id: string;
    name: string;
    oauth_email?: string | null;
    photo_url?: string | null;
    deleted_at: Date | null;
}

export const fetchProfiles = async (): Promise<PaginatedResponse<Profile> | null> =>
    request<PaginatedResponse<Profile> | null>('/profiles.json', {}, { results: [], count: 0 });

/** Failure-distinguishing profiles fetch for review-mode gating: resolves
 *  null when the list couldn't load. fetchProfiles resolves an empty
 *  fallback in that case, which review mode must not mistake for "no
 *  profiles" — continuing ID-less would rename the oldest profile. */
export const tryFetchProfiles = async (): Promise<PaginatedResponse<Profile> | null> => {
    const response = await requestRaw<PaginatedResponse<Profile>>('/profiles.json').catch(() => null);
    return response && response.ok ? response.data ?? null : null;
};

export const fetchProfile = async (id: string): Promise<Profile | null> =>
    request<Profile | null>(`/profiles/${id}.json`, {}, null);

/** Failure-distinguishing single-profile lookup: the bot-side twin of
 *  tryFetchBot (see bots.ts) — 'missing' only on a confirmed 404, null
 *  when the lookup couldn't run. */
export const tryFetchProfile = async (
    id: string
): Promise<Profile | 'missing' | null> => {
    const response = await requestRaw<Profile>(`/profiles/${id}.json`).catch(() => null);
    if (!response) {
        return null;
    }
    if (response.ok) {
        return response.data ?? null;
    }
    return response.status === 404 ? 'missing' : null;
};

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

/**
 * Create/update a profile. Returns the raw response (null only on transport
 * failure) so callers can surface field errors — e.g. a taken teen sign-in
 * email comes back as 400 with an `oauth_email` body — instead of treating
 * a rejection as a success. The data is a union because a non-2xx body is
 * the field-error shape, not a Profile; narrow (e.g. via `ok`) before
 * reading Profile fields.
 */
export const upsertProfile = async (
    profile: Profile,
    opts: { photoUri?: string | null; removePhoto?: boolean } = {},
): Promise<ApiResponse<Profile | FieldErrorBody> | null> => {
    const endpoint = profile.id === -1 ? '/profiles.json' : `/profiles/${profile.id}.json`;
    const method = profile.id === -1 ? 'POST' : 'PUT';
    // Photo changes need multipart so the image bytes can ride along;
    // text-only saves stay on the JSON path.
    if (opts.photoUri || opts.removePhoto) {
        const formData = new FormData();
        formData.append('name', profile.name);
        // Only send oauth_email when explicitly present: omitting it in a
        // multipart update must not clear an existing bound email.
        if (profile.oauth_email !== undefined) {
            formData.append('oauth_email', profile.oauth_email?.trim() ? profile.oauth_email.trim() : '');
        }
        if (profile.deleted_at) {
            const deletedAt = profile.deleted_at instanceof Date
                ? profile.deleted_at.toISOString()
                : String(profile.deleted_at);
            formData.append('deleted_at', deletedAt);
        }
        if (opts.removePhoto) {
            formData.append('remove_photo', 'true');
        }
        if (opts.photoUri) {
            const fileUri = opts.photoUri;
            const rawExt = fileUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpeg';
            // `jpg` is not a standard MIME subtype; normalize to `jpeg` so
            // the content-type is `image/jpeg`.
            const fileType = rawExt === 'jpg' ? 'jpeg' : rawExt;
            formData.append('photo', {
                uri: fileUri,
                name: `profile-photo.${fileType}`,
                type: `image/${fileType}`,
            } as any);
        }
        return requestRaw<Profile | FieldErrorBody>(endpoint, { method, body: formData });
    }
    return requestRaw<Profile | FieldErrorBody>(endpoint, {
        method,
        body: JSON.stringify(profile),
    });
};
