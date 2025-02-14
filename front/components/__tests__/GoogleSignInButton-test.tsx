import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GoogleSignInButton } from '../GoogleSignInButton';

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

describe('GoogleSignInButton', () => {
  it('renders correctly and handles press', () => {
    const mockOnPress = jest.fn();
    const { getByText, getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    // Verify the button text is rendered
    const buttonText = getByText('Sign in with Google');
    expect(buttonText).toBeTruthy();

    // Verify the button is pressable and calls onPress
    fireEvent.press(buttonText);
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
}); 