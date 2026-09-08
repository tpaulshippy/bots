import React from 'react';
import { render, screen } from '@testing-library/react-native';

import NotFoundScreen from '../+not-found';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Link = (props: { children?: unknown }) =>
    React.createElement(Text, { testID: 'not-found-home-link' }, props.children as never);
  return {
    Stack: { Screen: () => null },
    Link,
  };
});

describe('NotFoundScreen', () => {
  it('explains that the screen does not exist', () => {
    render(<NotFoundScreen />);

    expect(screen.getByText("This screen doesn't exist.")).toBeTruthy();
  });

  it('links back to the home screen', () => {
    render(<NotFoundScreen />);

    expect(screen.getByText('Go to home screen!')).toBeTruthy();
    expect(screen.getByTestId('not-found-home-link')).toBeTruthy();
  });

  it('renders without crashing (smoke)', () => {
    const { toJSON } = render(<NotFoundScreen />);

    expect(toJSON()).toBeTruthy();
  });
});
