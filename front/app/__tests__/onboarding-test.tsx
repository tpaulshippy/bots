import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';

import OnboardingWelcome from '../onboarding';
import OnboardingProfile from '../onboarding/profile';
import OnboardingBot from '../onboarding/bot';
import OnboardingProtect from '../onboarding/protect';
import { fetchProfiles } from '@/api/profiles';
import { fetchBots } from '@/api/bots';
import {
  bootstrapOnboarding,
  completeOnboarding,
} from '@/api/account';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
}));

jest.mock('@/api/account', () => ({
  bootstrapOnboarding: jest.fn(),
  completeOnboarding: jest.fn(),
}));

// protect.tsx pulls the push-registration helper out of the notifications
// screen; keep it out of native module territory.
jest.mock('../parent/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

describe('Onboarding wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: [{ profile_id: 'p1', name: 'Jordan' }],
      count: 1,
    });
    (fetchBots as jest.Mock).mockResolvedValue({
      results: [{ bot_id: 'b1', name: 'Penelope' }],
      count: 1,
    });
    (bootstrapOnboarding as jest.Mock).mockResolvedValue(undefined);
    (completeOnboarding as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Welcome', () => {
    it('advances to the kid-name step from Get started', async () => {
      render(<OnboardingWelcome />);
      expect(
        screen.getByTestId('onboarding-welcome-title').props.children
      ).toContain('Syft');

      fireEvent.press(screen.getByTestId('onboarding-get-started'));

      expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/profile');
    });
  });

  describe('Kid profile step', () => {
    it('pre-fills the existing first profile name and renames via params', async () => {
      render(<OnboardingProfile />);
      await act(async () => {});

      const input = screen.getByTestId('onboarding-profile-input');
      expect(input.props.value).toBe('Jordan');

      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: { profileName: 'Jordan' },
      });
    });

    it('blocks Continue without a name', async () => {
      (fetchProfiles as jest.Mock).mockResolvedValue({ results: [], count: 0 });
      render(<OnboardingProfile />);
      await act(async () => {});

      const button = screen.getByTestId('onboarding-profile-continue');
      expect(button.props.accessibilityState.disabled).toBe(true);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('goes back to the previous step', async () => {
      render(<OnboardingProfile />);

      fireEvent.press(screen.getByTestId('onboarding-back'));
      expect(mockRouter.back).toHaveBeenCalled();
    });
  });

  describe('Bot step', () => {
    it('defaults to Blank / Penelope and carries them to the protect step', async () => {
      render(<OnboardingBot />);
      await act(async () => {});

      const nameInput = screen.getByTestId('onboarding-bot-name-input');
      expect(nameInput.props.value).toBe('Penelope');
      expect(screen.getByTestId('onboarding-bot-template-Blank')).toBeTruthy();

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          profileName: '',
          botName: 'Penelope',
          templateName: 'Blank',
        }),
      });
    });

    it('requires a story for the Character template', async () => {
      render(<OnboardingBot />);
      await act(async () => {});

      fireEvent.press(screen.getByTestId('onboarding-bot-template-Character'));
      await act(async () => {
        fireEvent.changeText(
          screen.getByTestId('onboarding-bot-story-input'),
          'Frozen'
        );
      });

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          templateName: 'Character',
        }),
      });
    });
  });

  describe('Protect step', () => {
    beforeEach(() => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
      });
    });

    it('requires matching PINs before Finish is enabled', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-pin-input'), '1234');
      fireEvent.changeText(
        screen.getByTestId('onboarding-pin-confirm'),
        '9999'
      );
      expect(
        screen.getByTestId('onboarding-finish').props.accessibilityState
          .disabled
      ).toBe(true);

      await act(async () => {
        fireEvent.changeText(
          screen.getByTestId('onboarding-pin-confirm'),
          '1234'
        );
      });

      expect(
        screen.getByTestId('onboarding-finish').props.accessibilityState
          .disabled
      ).toBe(false);
    });

    it('bootstraps the account, selects the renamed profile and lands on chat', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-pin-input'), '1234');
      fireEvent.changeText(
        screen.getByTestId('onboarding-pin-confirm'),
        '1234'
      );
      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          profileName: 'Maya',
          botName: 'Penelope',
          templateName: 'Blank',
          pin: '1234',
        })
      );
      // The wizard pre-selects the renamed profile + first bot so chat works.
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedProfile',
        JSON.stringify({ profile_id: 'p1', name: 'Jordan' })
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedBot',
        JSON.stringify({ bot_id: 'b1', name: 'Penelope' })
      );
      expect(completeOnboarding).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });
  });
});
