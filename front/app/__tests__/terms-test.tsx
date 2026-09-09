import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import TermsScreen from '../parent/terms';

describe('TermsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  it('renders links to the terms of use and privacy policy', () => {
    render(<TermsScreen />);

    expect(screen.getByText('Terms of Use')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
  });

  it('opens the Apple EULA when Terms of Use is pressed', () => {
    render(<TermsScreen />);

    fireEvent.press(screen.getByText('Terms of Use'));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
    );
  });

  it('opens the privacy policy when Privacy Policy is pressed', () => {
    render(<TermsScreen />);

    fireEvent.press(screen.getByText('Privacy Policy'));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.freeprivacypolicy.com/live/6f20c0b8-408b-481d-a474-d3f589746d7b'
    );
  });
});
