import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';

import E2ETestSetup from '../e2e-test';
import { setTokens } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/tokens', () => ({
  setTokens: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

describe('E2ETestSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  it('stores tokens, profile, and bot then lands on chat', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      access: 'access-token',
      refresh: 'refresh-token',
      profile: JSON.stringify({ profile_id: 'p1' }),
      bot: JSON.stringify({ bot_id: 'b1' }),
    });
    render(<E2ETestSetup />);

    await waitFor(() =>
      expect(setTokens).toHaveBeenCalledWith({
        access: 'access-token',
        refresh: 'refresh-token',
      })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedProfile',
      JSON.stringify({ profile_id: 'p1' })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'selectedBot',
      JSON.stringify({ bot_id: 'b1' })
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('e2eTestMode', 'true');
    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it('still flags e2e mode and navigates with tokens alone', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      access: 'access-token',
      refresh: 'refresh-token',
    });
    render(<E2ETestSetup />);

    await waitFor(() => expect(setTokens).toHaveBeenCalled());
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'selectedProfile',
      expect.anything()
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('e2eTestMode', 'true');
    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it('shows a loading indicator while setting up (smoke)', () => {
    render(<E2ETestSetup />);

    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
