import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { NavigationDrawer } from '@/components/NavigationDrawer';
import { useSessionMode } from '@/hooks/useSessionMode';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@/hooks/useSessionMode', () => ({
  useSessionMode: jest.fn(),
}));

const mockUseSessionMode = useSessionMode as jest.Mock;

describe('NavigationDrawer session modes', () => {
  it('shows Chats, Flashcards, Study Materials, Activity, and Settings for parent sessions', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Study Materials')).toBeOnTheScreen();
    expect(screen.getByText('Activity')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
  });

  it('shows teen-safe Settings alongside Study Materials for teen-delegated sessions', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Study Materials')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    // Parent-only surfaces stay hidden.
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('fails closed to the teen-safe menu while the session mode is still loading', () => {
    mockUseSessionMode.mockReturnValue(null);

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByText('Chats')).toBeOnTheScreen();
    expect(screen.getByText('Flashcards')).toBeOnTheScreen();
    expect(screen.getByText('Study Materials')).toBeOnTheScreen();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('routes parent Settings to the PIN-gated parent screen', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('drawer-item-settings'));

    expect(replace).toHaveBeenCalledWith('/parent/settings');
  });

  it('routes teen Settings to the teen-safe screen (no parent surfaces)', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: true,
      activeProfileId: 'profile-maya',
    });
    const replace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });

    render(<NavigationDrawer isOpen={true} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('drawer-item-settings'));

    expect(replace).toHaveBeenCalledWith('/settings');
  });

  it('replaces instead of pushing so menu sections never stack', () => {
    mockUseSessionMode.mockReturnValue({
      isTeenDelegated: false,
      activeProfileId: null,
    });
    const replace = jest.fn();
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, replace });
    const onClose = jest.fn();

    render(<NavigationDrawer isOpen={true} onClose={onClose} />);

    fireEvent.press(screen.getByText('Activity'));

    expect(replace).toHaveBeenCalledWith('/parent/activity');
    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
