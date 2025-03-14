import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GoogleSignInButton } from '../GoogleSignInButton';

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

describe('GoogleSignInButton', () => {
  it('renders correctly and handles press', () => {
    const mockOnPress = jest.fn();
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    // Verify the button image
    const buttonImage = getByTestId('google-sign-in-button');
    expect(buttonImage).toBeTruthy();
    

    // Verify the button is pressable and calls onPress
    fireEvent.press(buttonImage);
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
}); 