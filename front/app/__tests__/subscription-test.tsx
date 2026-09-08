import React from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import { getAccount } from '@/api/account';
import SubscriptionScreen from '../parent/subscription';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useNavigation: jest.fn(),
  Stack: { Screen: () => null },
}));

jest.mock('react-native-purchases', () => ({
  configure: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
}));

const asMock = (fn: unknown) => fn as jest.Mock;

describe('SubscriptionScreen', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getAccount as jest.Mock).mockResolvedValue({
      userId: 42,
      hasPin: false,
      subscriptionLevel: 0,
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue({} as never);
    asMock(Purchases.getOfferings).mockResolvedValue({
      current: { availablePackages: [{ identifier: 'basic-monthly' }] },
      all: { Plus: { availablePackages: [{ identifier: 'plus-monthly' }] } },
    });
    asMock(Purchases.purchasePackage).mockResolvedValue({
      customerInfo: { entitlements: { active: { basic: {} } } },
    });
    asMock(Purchases.restorePurchases).mockResolvedValue({});
  });

  it('renders all plans, marks the current plan, and configures Purchases', async () => {
    render(<SubscriptionScreen />);

    await waitFor(() => expect(screen.getByText('Free')).toBeTruthy());
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Plus')).toBeTruthy();
    expect(screen.getByText('Current Plan')).toBeTruthy();
    expect(screen.getByText('Restore Purchases')).toBeTruthy();

    await waitFor(() =>
      expect(asMock(Purchases.configure)).toHaveBeenCalledWith(
        expect.objectContaining({ appUserID: '42' })
      )
    );
  });

  it('purchases the Basic package and shows a success alert', async () => {
    render(<SubscriptionScreen />);

    await waitFor(() => expect(screen.getByText('Basic')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getAllByText('Subscribe')[0]);
    });

    await waitFor(() =>
      expect(asMock(Purchases.purchasePackage)).toHaveBeenCalledWith({
        identifier: 'basic-monthly',
      })
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      expect.stringContaining('Basic'),
      expect.anything()
    );
  });

  it('restores purchases with a confirmation alert', async () => {
    render(<SubscriptionScreen />);

    await waitFor(() =>
      expect(screen.getByText('Restore Purchases')).toBeTruthy()
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Restore Purchases'));
    });

    await waitFor(() =>
      expect(asMock(Purchases.restorePurchases)).toHaveBeenCalled()
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Restore Purchases',
      expect.anything()
    );
  });

  it('opens the Apple support page instead of purchasing for the Free plan', async () => {
    // A paid account sees "Unsubscribe" on the Free card instead of
    // "Current Plan", exposing the cancel path.
    (getAccount as jest.Mock).mockResolvedValue({
      userId: 42,
      hasPin: false,
      subscriptionLevel: 1,
    });

    render(<SubscriptionScreen />);

    await waitFor(() => expect(screen.getByText('Unsubscribe')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Unsubscribe'));
    });

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://support.apple.com/en-us/118428'
      )
    );
    expect(asMock(Purchases.purchasePackage)).not.toHaveBeenCalled();
  });
});
