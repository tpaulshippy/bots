import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import BotsList from '../parent/botsList';
import { fetchBots } from '@/api/bots';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

describe('BotsList', () => {
  it('tints each row icon with the bot color', async () => {
    (fetchBots as jest.Mock).mockResolvedValue({
      results: [
        { bot_id: 'bot-1', name: 'Fred', color: '#FF5D8F', icon: 'text.bubble' },
      ],
      count: 1,
    });

    render(<BotsList />);

    await waitFor(() => expect(screen.getByText('Fred')).toBeTruthy());

    // IconSymbol is mocked to a host string (jest.setup.js).
    const icon = screen
      .UNSAFE_getAllByType('IconSymbol' as never)
      .find((node) => node.props.name === 'text.bubble');
    expect(icon?.props.color).toBe('#FF5D8F');
  });
});
