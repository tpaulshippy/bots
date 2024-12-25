import { apiClient } from './apiClient';

export interface Account {
    pin: number;
}

export const getAccount = async (): Promise<Account | null> => {
    try {
        const { data, ok, status } = await apiClient<Account>('/api/user');

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
        const { ok, status } = await apiClient<void>('/api/user', {
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
