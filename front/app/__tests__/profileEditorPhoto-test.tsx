import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

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

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/hooks/useSelectedProfile', () => ({
  getSelectedProfile: jest.fn(() => Promise.resolve(null)),
  setSelectedProfile: jest.fn(() => Promise.resolve()),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let headerRight: (() => React.ReactElement) | undefined;

describe('ProfileEditor photo', () => {
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
      photo_url: 'https://photos.test/maya.jpg',
      deleted_at: null,
    });
    (upsertProfile as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 5, profile_id: 'p1', name: 'Maya' },
    });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///new-photo.jpg' }],
    });
  });

  const pressSave = async () => {
    const element = headerRight!() as React.ReactElement<{
      onPress?: () => void | Promise<void>;
    }>;
    await act(async () => {
      await element.props.onPress?.();
    });
  };

  it('offers change/remove when a photo exists, and remove clears it on save', async () => {
    const screen = render(<ProfileEditor />);
    await act(async () => {});

    expect(screen.getByText('Change photo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-photo-remove'));
    await act(async () => {});
    expect(screen.getByText('Add photo')).toBeTruthy();

    await pressSave();

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      { photoUri: null, removePhoto: true }
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('uploads the picked image on save', async () => {
    const screen = render(<ProfileEditor />);
    await act(async () => {});

    fireEvent.press(screen.getByTestId('profile-photo-add'));
    await act(async () => {});

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true })
    );
    await pressSave();

    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      { photoUri: 'file:///new-photo.jpg', removePhoto: false }
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('saves text-only when the photo is untouched', async () => {
    render(<ProfileEditor />);
    await act(async () => {});

    await pressSave();

    // Single-arg call: the JSON path, no multipart overhead.
    expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
    expect((upsertProfile as jest.Mock).mock.calls[0]).toHaveLength(1);
  });
});
