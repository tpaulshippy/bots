import React from 'react';
import { Alert } from 'react-native';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import SetPin from '../parent/setPin';
import { getAccount, setPin as setPinApi, removePin as removePinApi } from '@/api/account';
import {
  getCachedHasPin,
  setCachedHasPin,
  clearParentSession,
} from '@/api/pinStorage';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useNavigation: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  getAccount: jest.fn(),
  setPin: jest.fn(),
  removePin: jest.fn(),
}));

jest.mock('@/api/pinStorage', () => ({
  getCachedHasPin: jest.fn(() => Promise.resolve(false)),
  setCachedHasPin: jest.fn(() => Promise.resolve()),
  clearParentSession: jest.fn(),
}));

describe('SetPin', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: false });
    (getCachedHasPin as jest.Mock).mockResolvedValue(false);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders the set-PIN form when no PIN exists', async () => {
    render(<SetPin />);
    await act(async () => {});

    expect(
      screen.getByText('Set a parent PIN (4–8 digits) to protect parent controls.')
    ).toBeTruthy();
    expect(screen.getByTestId('pin-new-input')).toBeTruthy();
    expect(screen.getByTestId('pin-confirm-input')).toBeTruthy();
    expect(screen.getByText('Save PIN')).toBeTruthy();
    // No current-PIN field on first set.
    expect(screen.queryByTestId('pin-current-input')).toBeNull();
  });

  it('shows a validation error when the PINs do not match', async () => {
    render(<SetPin />);
    await act(async () => {});

    fireEvent.changeText(screen.getByTestId('pin-new-input'), '1234');
    fireEvent.changeText(screen.getByTestId('pin-confirm-input'), '9999');
    fireEvent.press(screen.getByTestId('pin-save-button'));

    expect(screen.getByTestId('pin-error')).toBeTruthy();
    expect(screen.getByText('PINs do not match.')).toBeTruthy();
    expect(setPinApi).not.toHaveBeenCalled();
  });

  it('saves a matching PIN and backs out', async () => {
    (setPinApi as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    render(<SetPin />);
    await act(async () => {});

    fireEvent.changeText(screen.getByTestId('pin-new-input'), '1234');
    fireEvent.changeText(screen.getByTestId('pin-confirm-input'), '1234');

    await act(async () => {
      fireEvent.press(screen.getByTestId('pin-save-button'));
    });

    await waitFor(() =>
      expect(setPinApi).toHaveBeenCalledWith('1234', undefined)
    );
    expect(setCachedHasPin).toHaveBeenCalledWith(true);
    expect(clearParentSession).toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('offers PIN removal behind a confirm dialog when a PIN exists', async () => {
    (getAccount as jest.Mock).mockResolvedValue({ userId: 1, hasPin: true });
    (removePinApi as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    render(<SetPin />);
    await act(async () => {});

    // Change mode: current-PIN field, Change label, Remove button.
    expect(
      screen.getByText('Change your parent PIN (4–8 digits).')
    ).toBeTruthy();
    expect(screen.getByTestId('pin-current-input')).toBeTruthy();
    expect(screen.getByText('Change PIN')).toBeTruthy();
    expect(screen.getByTestId('pin-remove-button')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('pin-current-input'), '1234');
    fireEvent.press(screen.getByTestId('pin-remove-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Remove PIN?',
      expect.anything(),
      expect.anything()
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const remove = buttons.find((b) => b.text === 'Remove');
    await act(async () => {
      remove?.onPress?.();
    });

    await waitFor(() => expect(removePinApi).toHaveBeenCalledWith('1234'));
    expect(setCachedHasPin).toHaveBeenCalledWith(false);
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
