import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NavigationDrawer } from '@/components/NavigationDrawer';
import { useSessionMode } from '@/hooks/useSessionMode';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@/hooks/useSessionMode', () => ({
  useSessionMode: jest.fn(),
}));

const mockUseSessionMode = useSessionMode as jest.Mock;

describe('NavigationDrawer session modes', () => {
  it('shows Chats, Flashcards, and Settings for parent sessions', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });

  it('hides Settings for teen-delegated sessions', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.queryByText('Settings')).toBeNull();
  });
});
