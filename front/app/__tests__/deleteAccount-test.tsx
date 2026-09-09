import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { useNavigation, useRouter } from 'expo-router';
import DeleteAccountScreen from '../parent/deleteAccount';
import { deleteAccount } from '@/api/account';
import { clearUser } from '@/api/tokens';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useNavigation: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  deleteAccount: jest.fn(),
}));

jest.mock('@/api/tokens', () => ({
  clearUser: jest.fn(),
}));

describe('DeleteAccountScreen', () => {
  const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useNavigation as jest.Mock).mockReturnValue({ setOptions: jest.fn() });
    (deleteAccount as jest.Mock).mockResolvedValue(undefined);
    (clearUser as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders the confirmation prompt and confirm button', () => {
    render(<DeleteAccountScreen />);

    expect(
      screen.getByText(
        'Are you sure you want to delete your account? You will lose all data.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Confirm Account Deletion')).toBeTruthy();
  });

  it('deletes the account, clears the session and returns to login', async () => {
    render(<DeleteAccountScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Confirm Account Deletion'));
    });

    await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
    expect(clearUser).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('shows an inline error and stays put when deletion fails', async () => {
    (deleteAccount as jest.Mock).mockRejectedValue(new Error('boom'));

    render(<DeleteAccountScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Confirm Account Deletion'));
    });

    await waitFor(() =>
      expect(screen.getByText('Error deleting account.')).toBeTruthy()
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
