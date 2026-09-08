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
  fetchDeviceByToken,
  setDeviceIdInStorage,
  upsertDevice,
} from '@/api/devices';
import { registerForPushNotificationsAsync } from '../parent/notifications';
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

jest.mock('@/api/devices', () => ({
  fetchDeviceByToken: jest.fn(),
  setDeviceIdInStorage: jest.fn(),
  upsertDevice: jest.fn(),
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
    (bootstrapOnboarding as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
    });
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
    it('starts blank with a Student name placeholder and forwards the typed name', async () => {
      render(<OnboardingProfile />);
      await act(async () => {});

      const input = screen.getByTestId('onboarding-profile-input');
      expect(input.props.value).toBe('');
      expect(input.props.placeholder).toBe('Student name');

      fireEvent.changeText(input, 'Alex');
      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: { profileName: 'Alex' },
      });
    });

    it('blocks Continue without a name', async () => {
      render(<OnboardingProfile />);
      await act(async () => {});

      const button = screen.getByTestId('onboarding-profile-continue');
      expect(button.props.accessibilityState.disabled).toBe(true);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('forwards the student email so teens can log in as themselves', async () => {
      render(<OnboardingProfile />);
      await act(async () => {});

      fireEvent.changeText(
        screen.getByTestId('onboarding-profile-input'),
        'Alex'
      );
      fireEvent.changeText(
        screen.getByTestId('onboarding-student-email-input'),
        'Maya@School.edu'
      );
      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: { profileName: 'Alex', studentEmail: 'maya@school.edu' },
      });
    });

    it('blocks Continue with an invalid student email', async () => {
      render(<OnboardingProfile />);
      await act(async () => {});

      fireEvent.changeText(
        screen.getByTestId('onboarding-student-email-input'),
        'not-an-email'
      );

      const button = screen.getByTestId('onboarding-profile-continue');
      expect(button.props.accessibilityState.disabled).toBe(true);
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

    it('allows PIN-less finish but blocks mismatched PINs', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      // Empty PIN fields = PIN-less: Finish stays enabled with clear label.
      expect(
        screen.getByTestId('onboarding-finish').props.accessibilityState
          .disabled
      ).toBe(false);
      expect(screen.getByTestId('onboarding-pinless-hint')).toBeTruthy();

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

    it('finishes PIN-less without sending a PIN', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.not.objectContaining({ pin: expect.anything() })
      );
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
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

    it('selects the configured profile even when it is not listed first', async () => {      // Listings are name-ordered; "Zoe" sorts after "Maya".
      (fetchProfiles as jest.Mock).mockResolvedValue({
        results: [
          { profile_id: 'p2', name: 'Maya' },
          { profile_id: 'p1', name: 'Zoe' },
        ],
        count: 2,
      });
      (bootstrapOnboarding as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          profileId: 'p1',
          botId: 'b1',
        },
      });

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

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedProfile',
        JSON.stringify({ profile_id: 'p1', name: 'Zoe' })
      );
    });

    it('offers the PR46 notification options and persists the chosen flags', async () => {
      (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(
        'ExponentPushToken[test]'
      );
      (fetchDeviceByToken as jest.Mock).mockResolvedValue(null);
      (upsertDevice as jest.Mock).mockResolvedValue({
        device_id: 'd1',
      });

      render(<OnboardingProtect />);
      await act(async () => {});

      // All three PR46 options are visible; the legacy testID stays on the
      // new-chat toggle.
      expect(screen.getByTestId('onboarding-notifications-switch')).toBeTruthy();
      expect(screen.getByTestId('onboarding-notify-message-switch')).toBeTruthy();
      expect(screen.getByTestId('onboarding-notify-digest-switch')).toBeTruthy();

      fireEvent(screen.getByTestId('onboarding-notifications-switch'), 'onValueChange', true);
      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: -1,
          notification_token: 'ExponentPushToken[test]',
          notify_on_new_chat: true,
          notify_on_new_message: false,
          notify_digest_only: false,
        })
      );
      expect(setDeviceIdInStorage).toHaveBeenCalledWith('d1');
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('digest-only disables the immediate pushes and skips them on save', async () => {
      (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(
        'ExponentPushToken[test]'
      );
      (fetchDeviceByToken as jest.Mock).mockResolvedValue(null);
      (upsertDevice as jest.Mock).mockResolvedValue({
        device_id: 'd1',
      });

      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent(screen.getByTestId('onboarding-notify-digest-switch'), 'onValueChange', true);

      expect(
        screen.getByTestId('onboarding-notifications-switch').props.disabled
      ).toBe(true);
      expect(
        screen.getByTestId('onboarding-notify-message-switch').props.disabled
      ).toBe(true);

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          notify_on_new_chat: false,
          notify_on_new_message: false,
          notify_digest_only: true,
        })
      );
    });

    it('skips device registration when all notifications are off', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
      expect(upsertDevice).not.toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('shows an inline error and stays put when the student email is taken', async () => {
      (bootstrapOnboarding as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        data: {
          studentEmail: ['That email is already used by another profile.'],
        },
      });

      render(<OnboardingProtect />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      const banner = screen.getByTestId('onboarding-save-error');
      expect(banner.props.children).toContain('already used');
      expect(banner.props.children).toContain('Step 2');
      // Nothing was saved: no profile/bot selection, no completion, no chat.
      expect(completeOnboarding).not.toHaveBeenCalled();
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        'selectedProfile',
        expect.anything()
      );
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });
});
