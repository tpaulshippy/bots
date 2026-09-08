import { request, requestRaw } from './request';
import type { ApiResponse } from './apiClient';
import type { FieldErrorBody } from './fieldErrors';

// Shape returned by GET /api/user (roadmap doc 02). The PIN itself is
// hashed server-side and never sent to the client — only hasPin.
export interface Account {
    userId: number;
    hasPin: boolean;
    cost?: number;
    maxDailyCost?: number;
    subscriptionLevel?: number;
    timezone?: string;
    onboardingCompleted?: boolean;
}

export type PartialAccount = Partial<Account> & { pin: string };

export interface OnboardingBootstrapPayload {
    profileName: string;
    studentEmail?: string;
    botName?: string;
    templateName?: string;
    pin?: string;
    systemPrompt?: string;
    color?: string;
    icon?: string;
}

export interface OnboardingBootstrapResult {
    response?: string;
    onboardingCompleted?: boolean;
    // Identifies exactly which profile/bot the wizard configured, since
    // profile listings are name-ordered and the default may not be first.
    profileId?: string;
    botId?: string;
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

// Marks first-run onboarding complete; idempotent on the server.
export const completeOnboarding = async (): Promise<void> => {
    await request<void>('/user/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({}),
    }, undefined);
};

// Atomic wizard save: profile name, first bot, PIN and completion flag.
// Returns the raw response (null only on transport failure) so the wizard
// can surface field errors — e.g. a taken student email comes back as 400
// with a `studentEmail` body — instead of sailing on as if it succeeded.
// The data is a union because a non-2xx body is the field-error shape, not
// the success shape; narrow (e.g. via `ok`) before reading success fields.
export const bootstrapOnboarding = async (
    payload: OnboardingBootstrapPayload
): Promise<ApiResponse<OnboardingBootstrapResult | FieldErrorBody> | null> => {
    return requestRaw<OnboardingBootstrapResult | FieldErrorBody>('/onboarding/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const deleteAccount = async (): Promise<void> => {
    await request<void>('/user/delete', {
        method: 'DELETE',
    }, undefined);
};

/**
 * Remove the parent PIN (DELETE /api/user/pin — opt out of PIN protection).
 * Requires an active parent reauth session plus the current PIN.
 * Returns the raw response so callers can distinguish 403 (wrong current
 * PIN / expired reauth) from transport failures (null).
 */
export const removePin = async (
    currentPin: string
): Promise<ApiResponse<void> | null> => {
    return requestRaw<void>('/user/pin', {
        method: 'DELETE',
        body: JSON.stringify({ currentPin }),
    });
};
