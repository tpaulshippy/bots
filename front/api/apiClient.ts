import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export interface ApiResponse<T> {
    data: T;
    status: number;
    ok: boolean;
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