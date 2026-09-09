import React from 'react';
import { render, screen } from '@testing-library/react-native';

import ChatHistory from '../chatHistory';

jest.mock('../chatList', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(Text, { testID: 'chat-list' }, 'ChatList'),
  };
});

describe('ChatHistory', () => {
  it('renders the chat list', () => {
    render(<ChatHistory />);

    expect(screen.getByTestId('chat-list')).toBeTruthy();
  });

  it('renders exactly one chat list (smoke)', () => {
    render(<ChatHistory />);

    expect(screen.getAllByTestId('chat-list')).toHaveLength(1);
  });
});
