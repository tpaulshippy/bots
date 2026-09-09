import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ProfileAvatar } from '../ProfileAvatar';

describe('ProfileAvatar', () => {
  it('shows the first-letter initial when there is no photo', () => {
    render(<ProfileAvatar profile={{ name: 'Maya', photo_url: null }} />);
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.queryByLabelText('Maya profile photo')).toBeNull();
  });

  it('shows the photo instead of the initial when a photo was added', () => {
    render(
      <ProfileAvatar
        profile={{ name: 'Maya', photo_url: 'https://photos.test/maya.jpg' }}
        testID="avatar"
      />
    );
    expect(screen.queryByText('M')).toBeNull();
    const image = screen.getByTestId('avatar');
    expect(image.props.source).toEqual({ uri: 'https://photos.test/maya.jpg' });
  });
});
