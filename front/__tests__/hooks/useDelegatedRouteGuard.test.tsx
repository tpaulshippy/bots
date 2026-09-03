import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSessionMode } from '@/hooks/useSessionMode';
import { useDelegatedRouteGuard } from '@/hooks/useDelegatedRouteGuard';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('@/hooks/useSessionMode', () => ({
  useSessionMode: jest.fn(),
}));

function Harness() {
  useDelegatedRouteGuard();
  return <Text>screen</Text>;
}

describe('useDelegatedRouteGuard', () => {
  const mockRouter = { replace: jest.fn(), push: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it('redirects /parent/* routes to chat for teen-delegated sessions', async () => {
    (usePathname as jest.Mock).mockReturnValue('/parent/settings');
    (useSessionMode as jest.Mock).mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'p1',
    });

    render(<Harness />);
    await act(async () => {});

    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it('leaves parent routes alone for parent sessions', async () => {
    (usePathname as jest.Mock).mockReturnValue('/parent/settings');
    (useSessionMode as jest.Mock).mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<Harness />);
    await act(async () => {});

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('does not redirect teen sessions on kid-safe routes', async () => {
    (usePathname as jest.Mock).mockReturnValue('/chatHistory');
    (useSessionMode as jest.Mock).mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'p1',
    });

    render(<Harness />);
    await act(async () => {});

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
