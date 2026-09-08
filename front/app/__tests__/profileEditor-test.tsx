import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router';

import ProfileEditor from '../parent/profileEditor';
import { fetchProfile, upsertProfile } from '@/api/profiles';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
  useNavigation: jest.fn(),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfile: jest.fn(),
  upsertProfile: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let headerRight: (() => React.ReactElement) | undefined;

describe('ProfileEditor taken email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    headerRight = undefined;
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ profileId: 'p1' });
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: (opts: { headerRight?: () => React.ReactElement }) => {
        headerRight = opts.headerRight;
      },
    });
    (fetchProfile as jest.Mock).mockResolvedValue({
      id: 5,
      profile_id: 'p1',
      name: 'Maya',
      oauth_email: null,
      deleted_at: null,
    });
  });

  // The save control lives in the navigation header; grab its onPress from
  // the rendered element instead of mounting a second tree.
  const pressSave = async () => {
    const element = headerRight!() as React.ReactElement<{
      onPress?: () => void | Promise<void>;
    }>;
    await act(async () => {
      await element.props.onPress?.();
    });
  };

  it('stays on screen with an inline error when the email is taken', async () => {
    (upsertProfile as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      data: { oauth_email: ['That email is already used by another profile.'] },
    });

    const screen = render(<ProfileEditor />);
    await act(async () => {});

    fireEvent.changeText(
      screen.getByTestId('teen-signin-email-input'),
      'taken@school.edu'
    );
    await pressSave();

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ oauth_email: 'taken@school.edu' })
    );
    expect(screen.getByTestId('teen-signin-email-taken')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('backs out on success', async () => {
    (upsertProfile as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 5, profile_id: 'p1', name: 'Maya' },
    });

    render(<ProfileEditor />);
    await act(async () => {});

    await pressSave();

    expect(mockRouter.back).toHaveBeenCalled();
  });
});
