import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { useNavigation, useRouter } from 'expo-router';
import ProfilesList from '../parent/profilesList';
import { fetchProfiles } from '@/api/profiles';
import {
  getSelectedProfile,
  setSelectedProfile as storeSelectedProfile,
} from '@/hooks/useSelectedProfile';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn(),
    useNavigation: jest.fn(),
    // Mimic focus-on-mount: run the effect after render, not during it.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
}));

jest.mock('@/hooks/useSelectedProfile', () => ({
  getSelectedProfile: jest.fn(),
  setSelectedProfile: jest.fn(),
}));

const profiles = [
  { id: 1, profile_id: 'p1', name: 'Maya', deleted_at: null },
  { id: 2, profile_id: 'p2', name: 'Leo', deleted_at: null },
];

describe('ProfilesList', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useNavigation as jest.Mock).mockReturnValue({ setOptions: jest.fn() });
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: profiles,
      count: 2,
    });
    (getSelectedProfile as jest.Mock).mockResolvedValue(null);
  });

  it('tells the user how to edit a profile', async () => {
    render(<ProfilesList />);

    await waitFor(() => expect(screen.getByText('Maya')).toBeTruthy());
    expect(
      screen.getByText(
        'Tap to select. Long-press or tap ✎ to edit.'
      )
    ).toBeTruthy();
  });

  it('shows an edit button per profile that opens the editor', async () => {
    render(<ProfilesList />);
    await waitFor(() => expect(screen.getByText('Maya')).toBeTruthy());

    const edit = screen.getByTestId('profile-edit-Maya');
    expect(edit.props.accessibilityLabel).toBe('Edit Maya');
    fireEvent.press(edit);

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/parent/profileEditor',
      params: { title: 'Maya', profileId: 'p1' },
    });
  });

  it('long-pressing a card still opens the editor', async () => {
    render(<ProfilesList />);
    await waitFor(() => expect(screen.getByText('Leo')).toBeTruthy());

    fireEvent(screen.getByTestId('profile-card-Leo'), 'onLongPress');

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/parent/profileEditor',
      params: { title: 'Leo', profileId: 'p2' },
    });
  });

  it('tapping a card selects the profile and dismisses', async () => {
    render(<ProfilesList />);
    await waitFor(() => expect(screen.getByText('Maya')).toBeTruthy());

    fireEvent.press(screen.getByTestId('profile-card-Maya'));

    await waitFor(() =>
      expect(storeSelectedProfile).toHaveBeenCalledWith(profiles[0])
    );
    expect(mockRouter.dismiss).toHaveBeenCalled();
  });
});
