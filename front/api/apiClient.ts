import AsyncStorage from "@react-native-async-storage/async-storage";

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
    const user = await loggedInUser();
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user?.access}`,
            ...options.headers,
        },
    });

    if (response.status === 401) {
        // Try using refresh token to get new access token
        await refreshWithRefreshToken(user);
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

export const loggedInUser = async () => {
    try {
      const loggedInUser = await AsyncStorage.getItem("loggedInUser");
      if (loggedInUser) {
        const userData = JSON.parse(loggedInUser);
        return userData;
      }
    } catch (error) {
      console.error("Failed to load the loggedInUser from local storage", error);
    }
  };

export const refreshWithRefreshToken = async (user: any) => {
    const response = await fetch(`${BASE_URL}/api/token/refresh/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: user.refresh }),
    });

    if (response.status !== 200) {
        throw new UnauthorizedError();
    }

    const text = await response.text();
    const data = JSON.parse(text);

    await AsyncStorage.setItem(
        "loggedInUser",
        JSON.stringify({ access: data.access, refresh: user.refresh })
    );
};