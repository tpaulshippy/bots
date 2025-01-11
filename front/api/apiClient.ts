import { getTokens, setTokens } from "./tokens";

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
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens?.access}`,
            ...options.headers,
        },
    });

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


export const refreshWithRefreshToken = async (user: any) => {
    if (!user) {
        throw new UnauthorizedError();
    }

    const response = await fetch(`${BASE_URL}/api/token/refresh/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: user.refresh }),
    });

    console.log(response.status);

    if (response.status !== 200) {
        throw new UnauthorizedError();
    }

    const text = await response.text();
    const data = JSON.parse(text);

    await setTokens(data);
};