import { request } from './request';

export interface Account {
    userId: number;
    pin: number | null;
    costForToday?: [number];
    maxDailyCost?: number;
    subscriptionLevel?: number;
}

export type PartialAccount = Partial<Account> & { pin: number };

export const getAccount = async (): Promise<Account | null> => {
    const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return request<Account | null>(`/user?timezone=${deviceTimeZone}`, {}, null);
};

export const updateAccount = async (account: PartialAccount): Promise<void> => {
    await request<void>('/user', {
        method: 'POST',
        body: JSON.stringify(account),
    }, undefined);
};

export const deleteAccount = async (): Promise<void> => {
    await request<void>('/user/delete', {
        method: 'DELETE',
    }, undefined);
};
