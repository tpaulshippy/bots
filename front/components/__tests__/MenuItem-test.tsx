import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MenuItem } from '../MenuItem';

const mainIcon = () =>
  screen
    // IconSymbol is mocked to a host string (jest.setup.js).
    .UNSAFE_getAllByType('IconSymbol' as never)
    .find((node) => node.props.name === 'star');

describe('MenuItem', () => {
  it('tints the icon with the given iconColor', () => {
    render(<MenuItem iconName="star" iconColor="#FF5D8F" title="Fred" />);

    expect(mainIcon()?.props.color).toBe('#FF5D8F');
  });

  it('falls back to the theme icon color without iconColor', () => {
    render(<MenuItem iconName="star" title="Fred" />);

    // useThemeColor is mocked to '#000000' in jest.setup.js.
    expect(mainIcon()?.props.color).toBe('#000000');
  });
});
