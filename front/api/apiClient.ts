import { getTokens, setTokens, TokenData } from "./tokens";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export interface ApiResponse<T> {
    data: T;
    status: number;
    ok: boolean;
}

export class UnauthorizedError extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'UnauthorizedError';
    }
}

export const apiClient = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> => {
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
    const response = await fetch(url, request);
    
    if (response.status === 401) {
        await refreshWithRefreshToken(tokens);
        return apiClient(endpoint, options);
    }

    const text = await response.text();
    const data = JSON.parse(text) as T;

    return {
        data,
        status: response.status,
        ok: response.ok,
    };
};


export const refreshWithRefreshToken = async (tokens: TokenData | null) => {
    if (!tokens || !tokens.refresh) {
        throw new UnauthorizedError();
    }

    const response = await fetch(`${BASE_URL}/api/token/refresh/`, {
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