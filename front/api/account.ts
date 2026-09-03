import { request, requestRaw } from './request';
import type { ApiResponse } from './apiClient';

// Shape returned by GET /api/user (roadmap doc 02). The PIN itself is
// hashed server-side and never sent to the client — only hasPin.
export interface Account {
    userId: number;
    hasPin: boolean;
    cost?: number;
    maxDailyCost?: number;
    subscriptionLevel?: number;
    timezone?: string;
}

export const getAccount = async (): Promise<Account | null> => {
    const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return request<Account | null>(`/user?timezone=${deviceTimeZone}`, {}, null);
};

/**
 * Set or change the parent PIN (POST /api/user).
 * - First set: pass just `pin`.
 * - Change: also pass `currentPin`; requires an active parent reauth session.
 * Returns the raw response so callers can distinguish 400 validation
 * failures from 403 (wrong current PIN / expired reauth); null on transport
 * or unexpected failures.
 */
export const setPin = async (
    pin: string,
    currentPin?: string
): Promise<ApiResponse<void> | null> => {
    return requestRaw<void>('/user', {
        method: 'POST',
        body: JSON.stringify(
            currentPin !== undefined ? { pin, currentPin } : { pin }
        ),
    });
};

export const deleteAccount = async (): Promise<void> => {
    await request<void>('/user/delete', {
        method: 'DELETE',
    }, undefined);
};
