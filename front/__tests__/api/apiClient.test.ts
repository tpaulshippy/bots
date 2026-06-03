import { apiClient } from '../../api/apiClient';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../api/tokens', () => ({
  getTokens: jest.fn(() => Promise.resolve({ access: 'test-token', refresh: 'refresh-token' })),
  setTokens: jest.fn(() => Promise.resolve()),
}));

describe('apiClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should NOT set Content-Type to application/json when body is FormData', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: () => Promise.resolve('{"success": true}'),
    });

    const formData = new FormData();
    formData.append('image', { uri: 'file://test.jpg', name: 'test.jpg', type: 'image/jpeg' } as any);

    await apiClient('/chats/new', {
      method: 'POST',
      body: formData,
    });

    const fetchCall = mockFetch.mock.calls[0];
    const requestInit = fetchCall[1];

    expect(requestInit.headers).not.toHaveProperty('Content-Type', 'application/json');
  });

  it('should set Content-Type to application/json for regular JSON requests', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: () => Promise.resolve('{"success": true}'),
    });

    await apiClient('/test', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    });

    const fetchCall = mockFetch.mock.calls[0];
    const requestInit = fetchCall[1];

    expect(requestInit.headers).toHaveProperty('Content-Type', 'application/json');
  });
});
