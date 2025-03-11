import { apiClient } from './apiClient';

export interface Account {
    userId: number;
    pin: number;
    costForToday?: [number];
    maxDailyCost?: number;
    subscriptionLevel?: number;
}

export const getAccount = async (): Promise<Account | null> => {
    try {
        const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { data, ok, status } = await apiClient<Account>(`/user?timezone=${deviceTimeZone}`);

        if (!ok) {
            throw new Error(`Failed to fetch account with status ${status}`);
        }
        return data;
    }
    catch (error: any) {
        console.error(error.toString());
        return null;
    }
};

export const updateAccount = async (account: Account): Promise<void> => {
    try {
        const { ok, status } = await apiClient<void>('/user', {
            method: 'POST',
            body: JSON.stringify(account),
        });

        if (!ok) {
            throw new Error(`Failed to update account with status ${status}`);
        }
    }
    catch (error: any) {
        console.error(error.toString());
    }
};

export const deleteAccount = async (): Promise<void> => {
    try {
        const { ok, status } = await apiClient<void>('/user/delete', {
            method: 'DELETE',
        });

        if (status !== 204) {
            throw new Error(`Failed to delete account with status ${status}`);
        }
    } catch (error: any) {
        console.error(error.toString());
    }
};
