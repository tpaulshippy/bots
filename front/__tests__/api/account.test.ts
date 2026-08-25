import { deleteAccount, getAccount, setPin } from '../../api/account';
import { apiClient } from '../../api/apiClient';

jest.mock('../../api/apiClient', () => ({
  apiClient: jest.fn(),
}));

const mockedClient = apiClient as unknown as jest.Mock;

describe('account API', () => {
  beforeEach(() => {
    mockedClient.mockReset();
    mockedClient.mockResolvedValue({ ok: true, status: 200, data: null });
  });

  describe('getAccount', () => {
    it('requests /user with the device timezone', async () => {
      await getAccount();

      expect(mockedClient).toHaveBeenCalledTimes(1);
      const [endpoint] = mockedClient.mock.calls[0];
      expect(endpoint.startsWith('/user?timezone=')).toBe(true);
    });
  });

  describe('setPin', () => {
    it('posts only the pin on first set', async () => {
      await setPin('1234');

      const [endpoint, options] = mockedClient.mock.calls[0];
      expect(endpoint).toBe('/user');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ pin: '1234' });
    });

    it('includes currentPin when changing an existing PIN', async () => {
      await setPin('5678', '1234');

      const [, options] = mockedClient.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ pin: '5678', currentPin: '1234' });
    });
  });

  describe('deleteAccount', () => {
    it('issues a DELETE to /user/delete', async () => {
      await deleteAccount();

      const [endpoint, options] = mockedClient.mock.calls[0];
      expect(endpoint).toBe('/user/delete');
      expect(options.method).toBe('DELETE');
    });
  });
});
