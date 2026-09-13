import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { NavigationDrawer } from '@/components/NavigationDrawer';
import { useSessionMode } from '@/hooks/useSessionMode';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@/hooks/useSessionMode', () => ({
  useSessionMode: jest.fn(),
}));

const mockUseSessionMode = useSessionMode as jest.Mock;
const mockPush = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
});

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

  it('shows teen-safe Settings for teen-delegated sessions', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });

  it('fails closed to teen-safe Settings while the session mode is still loading', () => {
    mockUseSessionMode.mockReturnValue(null);

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });

  it('routes parent Settings to the PIN-gated parent screen', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('drawer-item-settings'));

    expect(mockPush).toHaveBeenCalledWith('/parent/settings');
  });

  it('routes teen Settings to the teen-safe screen (no parent surfaces)', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('drawer-item-settings'));

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
