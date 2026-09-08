import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { useNavigation, useRouter } from 'expo-router';
import SettingsScreen from '../parent/settings';
import { getAccount } from '@/api/account';
import { clearUser } from '@/api/tokens';
import { getCachedHasPin } from '@/api/pinStorage';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useNavigation: jest.fn(),
    // Mimic focus-on-mount: run the effect after render, not during it.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-updates', () => ({
  updateId: 'test-update-id',
}));

jest.mock('react-native-progress', () => ({
  Bar: 'ProgressBar',
}));

// Bypass the server-verified PIN gate: the settings controls render inside
// PinWrapper when a PIN is set, and unlocking needs native reauth.
jest.mock('@/components/PinWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(),
}));

jest.mock('@/api/pinStorage', () => ({
  getCachedHasPin: jest.fn(() => Promise.resolve(false)),
}));

describe('SettingsScreen', () => {
  const mockRouter = {
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useNavigation as jest.Mock).mockReturnValue({ setOptions: jest.fn() });
    (getAccount as jest.Mock).mockResolvedValue({
      userId: 1,
      hasPin: false,
      cost: 10,
      maxDailyCost: 100,
      subscriptionLevel: 0,
    });
    (getCachedHasPin as jest.Mock).mockResolvedValue(false);
    (clearUser as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders the subscription summary and menu items after loading', async () => {
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('menu-item-bots')).toBeTruthy()
    );
    expect(
      screen.getByText('You have the Free subscription.')
    ).toBeTruthy();
    expect(screen.getByText(/10\.00% of available tokens used/)).toBeTruthy();
    expect(screen.getByTestId('menu-profiles')).toBeTruthy();
    expect(screen.getByTestId('menu-item-set-pin')).toBeTruthy();
    expect(screen.getByTestId('menu-item-delete-account')).toBeTruthy();
    expect(screen.getByTestId('menu-item-log-out')).toBeTruthy();
  });

  it('navigates to the bots list with the subscription level', async () => {
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('menu-item-bots')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('menu-item-bots'));

    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/parent/botsList',
      params: { subscriptionLevel: 0 },
    });
  });

  it('logs out and returns to login', async () => {
    render(<SettingsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('menu-item-log-out')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('menu-item-log-out'));

    await waitFor(() => expect(clearUser).toHaveBeenCalled());
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('falls back to the cached PIN flag when the account cannot load', async () => {
    (getAccount as jest.Mock).mockRejectedValue(new Error('offline'));
    (getCachedHasPin as jest.Mock).mockResolvedValue(false);

    render(<SettingsScreen />);

    await waitFor(() => expect(getCachedHasPin).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('menu-item-bots')).toBeTruthy()
    );
  });
});
