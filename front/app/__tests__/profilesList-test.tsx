import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { useNavigation, useRouter } from 'expo-router';
import ProfilesList from '../parent/profilesList';
import { fetchProfiles } from '@/api/profiles';

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
  });

  it('tells the user how to edit a profile', async () => {
    render(<ProfilesList />);

    await waitFor(() => expect(screen.getByText('Maya')).toBeTruthy());
    expect(
      screen.getByText(
        'Tap a profile to edit its details.'
      )
    ).toBeTruthy();
  });

  it('tapping a card opens the editor', async () => {
    render(<ProfilesList />);
    await waitFor(() => expect(screen.getByText('Maya')).toBeTruthy());

    const card = screen.getByTestId('profile-card-Maya');
    expect(card.props.accessibilityLabel).toBe('Edit Maya');
    fireEvent.press(card);

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/parent/profileEditor',
      params: { title: 'Maya', profileId: 'p1' },
    });
  });
});
