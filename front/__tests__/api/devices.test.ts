import { fetchDevice, upsertDevice } from '../../api/devices';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn((url, options = {}) => {
    const method = options.method || 'GET';
    
    if (url.match(/\/devices\?notificationToken=/)) {
      return Promise.resolve({
        ok: true,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              device_id: '550e8400-e29b-41d4-a716-446655440001',
              notification_token: 'test-token-123',
              notify_on_new_chat: true,
              notify_on_new_message: false,
              deleted_at: null,
              created_at: '2024-01-01T00:00:00Z',
              modified_at: '2024-01-01T00:00:00Z',
            },
          ],
        },
      });
    }
    
    if (url.match(/\/devices\/[^/]+\.json$/)) {
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          data: {
            id: 1,
            device_id: '550e8400-e29b-41d4-a716-446655440001',
            notification_token: 'test-token-123',
            notify_on_new_chat: true,
            notify_on_new_message: false,
            deleted_at: null,
            created_at: '2024-01-01T00:00:00Z',
            modified_at: '2024-01-01T00:00:00Z',
          },
        });
      }
      if (method === 'PUT') {
        return Promise.resolve({
          ok: true,
          data: {
            id: 1,
            device_id: '550e8400-e29b-41d4-a716-446655440001',
            notification_token: 'test-token-123',
            notify_on_new_chat: false,
            notify_on_new_message: true,
            deleted_at: null,
            created_at: '2024-01-01T00:00:00Z',
            modified_at: '2024-01-02T00:00:00Z',
          },
        });
      }
    }
    
    return Promise.resolve({ ok: true, data: null });
  }),
}));

describe('Devices API', () => {
  describe('fetchDevice', () => {
    it('should fetch device by id', async () => {
      const response = await fetchDevice('1');

      expect(response).not.toBeNull();
      expect(response?.device_id).toBeDefined();
      expect(response?.notification_token).toBe('test-token-123');
    });

    it('should include required fields', async () => {
      const response = await fetchDevice('1');

      if (response) {
        expect(response).toHaveProperty('device_id');
        expect(response).toHaveProperty('notification_token');
        expect(response).toHaveProperty('notify_on_new_chat');
      }
    });
  });

  describe('upsertDevice', () => {
    it('should update existing device', async () => {
      const response = await upsertDevice({
        id: 1,
        device_id: '550e8400-e29b-41d4-a716-446655440001',
        notification_token: 'test-token-123',
        notify_on_new_chat: false,
        notify_on_new_message: true,
        deleted_at: null,
      });

      expect(response).not.toBeNull();
      expect(response?.notify_on_new_chat).toBe(false);
      expect(response?.notify_on_new_message).toBe(true);
    });
  });
});