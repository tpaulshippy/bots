import { getTokens, setTokens, TokenData } from "./tokens";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export interface ApiResponse<T> {
    data: T | null;
    status: number;
    ok: boolean;
}

export class UnauthorizedError extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends Error {
    constructor() {
        super('Forbidden');
        this.name = 'ForbiddenError';
    }
}

function xhrRequest<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(init.method || 'GET', url);

        const headers = init.headers as Record<string, string> | undefined;
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                xhr.setRequestHeader(key, value);
            }
        }

        xhr.onload = () => {
            const text = xhr.responseText;
            let data: T | null = null;
            try {
                data = JSON.parse(text) as T;
            } catch {
                data = null;
            }
            resolve({
                data,
                status: xhr.status,
                ok: xhr.status >= 200 && xhr.status < 300,
            });
        };

        xhr.onerror = () => {
            reject(new Error('Network request failed'));
        };

        xhr.send(init.body as any);
    });
}

export const apiClient = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> => {
    const maxRetries = 2;
    let attempts = 0;
    while (attempts < maxRetries) {
        const tokens = await getTokens();
        const isFormData = options.body instanceof FormData;
        const request = {
            ...options,
            headers: {
                ...(!isFormData && { 'Content-Type': 'application/json' }),
                'Authorization': `Bearer ${tokens?.access}`,
                ...options.headers,
            },
        };
        const url = `${BASE_URL}${endpoint}`;

        // Use XMLHttpRequest for FormData to bypass any fetch polyfill
        // that doesn't support React Native's proprietary {uri,name,type}
        // FormData parts (e.g. Expo's winter/fetch).
        let response: ApiResponse<T>;
        if (isFormData) {
            response = await xhrRequest<T>(url, request);
        } else {
            const fetchResponse = await fetch(url, request);
            response = {
                data: null,
                status: fetchResponse.status,
                ok: fetchResponse.ok,
            };
            if (options.method !== 'DELETE') {
                const text = await fetchResponse.text();
                try {
                    response.data = JSON.parse(text) as T;
                } catch {
                    response.data = null;
                }
            }
        }

        if (response.status === 401) {
            attempts++;
            await refreshWithRefreshToken(tokens);
            continue;
        }

        if (response.status === 403) {
            throw new ForbiddenError();
        }

        if (options.method === 'DELETE') {
            return {
                data: null,
                status: response.status,
                ok: response.ok,
            };
        }

        return response;
    }
    throw new UnauthorizedError();
};

export const refreshWithRefreshToken = async (tokens: TokenData | null) => {
    if (!tokens || !tokens.refresh) {
        throw new UnauthorizedError();
    }

    const response = await fetch(`${BASE_URL}/token/refresh/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: tokens.refresh }),
    });

    if (response.status !== 200) {
        throw new UnauthorizedError();
    }

    const text = await response.text();
    const refreshedTokens = JSON.parse(text);

    await setTokens({
        access: refreshedTokens.access,
        refresh: tokens.refresh,
    });
};