import * as Sentry from "@sentry/react-native";
import { apiClient, ApiResponse, UnauthorizedError } from "./apiClient";

export interface PaginatedResponse<T> {
    results: T[];
    next?: string;
    previous?: string;
    count: number;
}

// Standard request handling shared by all API modules: returns the response
// data on success, rethrows UnauthorizedError so screens can trigger the
// logout flow, and reports any other failure to Sentry before resolving to
// `fallback`. An ok response without a body also resolves to `fallback`.
export const request = async <T>(
    endpoint: string,
    options: RequestInit,
    fallback: T
): Promise<T> => {
    try {
        const { data, ok, status } = await apiClient<T>(endpoint, options);

        if (!ok) {
            throw new Error(`Request to ${endpoint} failed with status ${status}`);
        }
        return data ?? fallback;
    } catch (error: any) {
        if (error instanceof UnauthorizedError) {
            throw error;
        }

        Sentry.captureException(error);
        return fallback;
    }
};

// Same error handling as request(), but returns the raw response for callers
// that need the status code or the ok flag. Resolves to null on failure.
export const requestRaw = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T> | null> => {
    try {
        return await apiClient<T>(endpoint, options);
    } catch (error: any) {
        if (error instanceof UnauthorizedError) {
            throw error;
        }

        Sentry.captureException(error);
        return null;
    }
};
