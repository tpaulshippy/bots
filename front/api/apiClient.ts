import { clearUser, getTokens, setTokens, TokenData } from "./tokens";

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

export const apiClient = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> => {
    const maxRetries = 2;
    let attempts = 0;
    while (attempts < maxRetries) {
        const tokens = await getTokens();
        const request = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens?.access}`,
                ...options.headers,
            },
        };
        const url = `${BASE_URL}${endpoint}`;
        console.log("Fetching", url);
        const response = await fetch(url, request);
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

        const text = await response.text();
        const data = JSON.parse(text) as T;

        return {
            data,
            status: response.status,
            ok: response.ok,
        };
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