import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';

import OnboardingWelcome from '../onboarding';
import OnboardingProfile from '../onboarding/profile';
import OnboardingBot from '../onboarding/bot';
import OnboardingProtect from '../onboarding/protect';
import OnboardingNotifications from '../onboarding/notifications';
import { fetchProfiles, tryFetchProfiles, fetchProfile } from '@/api/profiles';
import { fetchBots, fetchBot } from '@/api/bots';
import {
  fetchDevice,
  getDeviceIdFromStorage,
  fetchDeviceByToken,
  setDeviceIdInStorage,
  upsertDevice,
} from '@/api/devices';
import { registerForPushNotificationsAsync } from '../parent/notifications';
import {
  bootstrapOnboarding,
  completeOnboarding,
} from '@/api/account';
import * as selectedProfileHooks from '@/hooks/useSelectedProfile';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/api/profiles', () => ({
  fetchProfiles: jest.fn(),
  tryFetchProfiles: jest.fn(),
  fetchProfile: jest.fn(),
}));

jest.mock('@/api/bots', () => ({
  fetchBots: jest.fn(),
  fetchBot: jest.fn(),
}));

jest.mock('@/api/devices', () => ({
  fetchDevice: jest.fn(),
  getDeviceIdFromStorage: jest.fn(),
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
    jest
      .spyOn(selectedProfileHooks, 'getSelectedProfile')
      .mockResolvedValue(null);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (fetchProfiles as jest.Mock).mockResolvedValue({
      results: [{ profile_id: 'p1', name: 'Jordan' }],
      count: 1,
    });
    (tryFetchProfiles as jest.Mock).mockResolvedValue({
      results: [{ profile_id: 'p1', name: 'Jordan' }],
      count: 1,
    });
    (fetchBots as jest.Mock).mockResolvedValue({
      results: [{ bot_id: 'b1', name: 'Penelope' }],
      count: 1,
    });
    // Single-bot lookups resolve null unless a test overrides them.
    (fetchBot as jest.Mock).mockResolvedValue(null);
    (bootstrapOnboarding as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: null,
    });
    (getDeviceIdFromStorage as jest.Mock).mockResolvedValue(null);
    (fetchDevice as jest.Mock).mockResolvedValue(null);
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

    it('preserves an explicit blank student email in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockResolvedValue({
          profile_id: 'p2',
          name: 'Maya',
          oauth_email: 'maya@school.edu',
        });
      (tryFetchProfiles as jest.Mock).mockResolvedValue({
        results: [{ profile_id: 'p2', name: 'Maya', oauth_email: 'maya@school.edu' }],
        count: 1,
      });

      render(<OnboardingProfile />);
      await act(async () => {});

      fireEvent.changeText(
        screen.getByTestId('onboarding-student-email-input'),
        ''
      );
      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: {
          profileName: 'Maya',
          studentEmail: '',
          review: 'true',
          profileId: 'p2',
        },
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

    it('refreshes the selected profile from the live list in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockResolvedValue({
          profile_id: 'p2',
          name: 'Old Maya',
          oauth_email: 'old@school.edu',
        });
      (tryFetchProfiles as jest.Mock).mockResolvedValue({
        results: [
          { profile_id: 'p1', name: 'Jordan' },
          { profile_id: 'p2', name: 'Maya', oauth_email: 'new@school.edu' },
        ],
        count: 2,
      });

      render(<OnboardingProfile />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-profile-input').props.value).toBe(
        'Maya'
      );
      expect(
        screen.getByTestId('onboarding-student-email-input').props.value
      ).toBe('new@school.edu');

      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: {
          profileName: 'Maya',
          studentEmail: 'new@school.edu',
          review: 'true',
          profileId: 'p2',
        },
      });
    });

    it('keeps the stored selected profile when its id is stale', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockResolvedValue({
          profile_id: 'p9',
          name: 'Maya',
          oauth_email: 'maya@school.edu',
        });
      (tryFetchProfiles as jest.Mock).mockResolvedValue({
        results: [{ profile_id: 'p1', name: 'Jordan' }],
        count: 1,
      });

      render(<OnboardingProfile />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-profile-input').props.value).toBe(
        'Maya'
      );

      fireEvent.press(screen.getByTestId('onboarding-profile-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/bot',
        params: {
          profileName: 'Maya',
          studentEmail: 'maya@school.edu',
          review: 'true',
          profileId: 'p9',
        },
      });
    });

    it('blocks Continue until review profile prefill finishes', async () => {
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockImplementation(() => new Promise(() => {}));
      (tryFetchProfiles as jest.Mock).mockImplementation(() => new Promise(() => {}));
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });

      render(<OnboardingProfile />);

      fireEvent.changeText(screen.getByTestId('onboarding-profile-input'), 'Maya');

      expect(
        screen.getByTestId('onboarding-profile-continue').props.accessibilityState
          .disabled
      ).toBe(true);
    });

    it('keeps Continue disabled when review profile prefill fails', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockResolvedValue(null);
      (tryFetchProfiles as jest.Mock).mockResolvedValue(null);

      render(<OnboardingProfile />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-profile-input'), 'Maya');

      expect(
        screen.getByTestId('onboarding-profile-continue').props.accessibilityState
          .disabled
      ).toBe(true);
    });

    it('allows review mode to recreate a missing profile after prefill completes', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      jest
        .spyOn(selectedProfileHooks, 'getSelectedProfile')
        .mockResolvedValue(null);
      (tryFetchProfiles as jest.Mock).mockResolvedValue({
        results: [],
        count: 0,
      });

      render(<OnboardingProfile />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-profile-input'), 'Maya');

      expect(
        screen.getByTestId('onboarding-profile-continue').props.accessibilityState
          .disabled
      ).toBe(false);
    });

    it('redirects to login when review prefill hits an expired session', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({ review: 'true' });
      const { UnauthorizedError: RealUnauthorizedError } = jest.requireActual(
        '@/api/apiClient'
      );
      (tryFetchProfiles as jest.Mock).mockRejectedValue(
        new RealUnauthorizedError()
      );

      render(<OnboardingProfile />);
      await act(async () => {});

      expect(mockRouter.replace).toHaveBeenCalledWith('/login');
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

    it('refreshes the selected bot from the live list in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Old Dragon',
                template_name: 'Character',
                color: '#111111',
                icon: 'flame',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [
          { bot_id: 'b1', name: 'Penelope' },
          {
            bot_id: 'b2',
            name: 'Dragon',
            template_name: 'Blank',
            color: '#222222',
            icon: 'sparkles',
          },
        ],
        count: 2,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-bot-name-input').props.value).toBe(
        'Dragon'
      );

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          profileName: 'Maya',
          profileId: 'p2',
          botName: 'Dragon',
          botId: 'b2',
          templateName: 'Blank',
          color: '#222222',
          icon: 'sparkles',
          review: 'true',
        }),
      });
    });

    it('keeps the stored selected bot when its id is stale', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b9',
                name: 'Dragon',
                template_name: 'Blank',
                color: '#333333',
                icon: 'sparkles',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b1', name: 'Penelope' }],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-bot-name-input').props.value).toBe(
        'Dragon'
      );

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          profileName: 'Maya',
          profileId: 'p2',
          botName: 'Dragon',
          botId: 'b9',
          templateName: 'Blank',
          color: '#333333',
          icon: 'sparkles',
          review: 'true',
        }),
      });
    });

    it('falls back to the live bot list when the cached selection is malformed', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === 'selectedBot' ? '{not valid json' : null)
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b1', name: 'Penelope' }],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      // Live data wins over the corrupt cache: prefill + target the first bot.
      expect(screen.getByTestId('onboarding-bot-name-input').props.value).toBe(
        'Penelope'
      );
      expect(
        screen.getByTestId('onboarding-bot-continue').props.accessibilityState
          .disabled
      ).toBe(false);

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          botName: 'Penelope',
          botId: 'b1',
          review: 'true',
        }),
      });
    });

    it('prefers live server state over a stale cached snapshot for the same id', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b9',
                name: 'Stale Name',
                template_name: 'Blank',
                color: '#111111',
                icon: 'flame',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b1', name: 'Penelope' }],
        count: 2,
      });
      // The selected bot lives beyond page one; the server copy is newer
      // than the cache (the bot editor never refreshes selectedBot).
      (fetchBot as jest.Mock).mockResolvedValue({
        bot_id: 'b9',
        name: 'Fresh Name',
        template_name: 'Blank',
        color: '#222222',
        icon: 'sparkles',
      });

      render(<OnboardingBot />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-bot-name-input').props.value).toBe(
        'Fresh Name'
      );

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          botName: 'Fresh Name',
          botId: 'b9',
          color: '#222222',
          review: 'true',
        }),
      });
    });

    it('resets missing live bot fields to defaults in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Old Dragon',
                template_name: 'Character',
                color: '#111111',
                icon: 'flame',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b2', name: 'Dragon', template_name: '', color: '', icon: '' }],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          botName: 'Dragon',
          botId: 'b2',
          templateName: 'Blank',
          color: '#2A9D8F',
          icon: 'sparkles',
          review: 'true',
        }),
      });
    });

    it('preserves a review bot system prompt when nothing prompt-related changed', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
        studentEmail: '',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Dragon',
                template_name: 'Blank',
                color: '#222222',
                icon: 'sparkles',
                system_prompt: 'custom prompt',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [
          {
            bot_id: 'b2',
            name: 'Dragon',
            template_name: 'Blank',
            color: '#222222',
            icon: 'sparkles',
            system_prompt: 'custom prompt',
          },
        ],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          studentEmail: '',
          botName: 'Dragon',
          botId: 'b2',
          systemPrompt: 'custom prompt',
          review: 'true',
        }),
      });
    });

    it('preserves a custom review bot prompt when prompt fields change', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Dragon',
                template_name: 'Blank',
                color: '#222222',
                icon: 'sparkles',
                response_length: 500,
                restrict_language: false,
                restrict_adult_topics: false,
                system_prompt: 'custom prompt',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [
          {
            bot_id: 'b2',
            name: 'Dragon',
            template_name: 'Blank',
            color: '#222222',
            icon: 'sparkles',
            response_length: 500,
            restrict_language: false,
            restrict_adult_topics: false,
            system_prompt: 'custom prompt',
          },
        ],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-bot-name-input'), 'Smaug');
      fireEvent.press(screen.getByTestId('onboarding-bot-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/protect',
        params: expect.objectContaining({
          botName: 'Smaug',
          botId: 'b2',
          systemPrompt: 'custom prompt',
          review: 'true',
        }),
      });
    });

    it('allows an unchanged Character bot to continue in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Elsa',
                template_name: 'Character',
                color: '#222222',
                icon: 'sparkles',
                system_prompt:
                  "Your name is Elsa, the character from Frozen. You speak with this character's voice and personality.",
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [
          {
            bot_id: 'b2',
            name: 'Elsa',
            template_name: 'Character',
            color: '#222222',
            icon: 'sparkles',
            system_prompt:
              "Your name is Elsa, the character from Frozen. You speak with this character's voice and personality.",
          },
        ],
        count: 1,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      expect(screen.getByTestId('onboarding-bot-story-input').props.value).toBe(
        'Frozen'
      );
      expect(
        screen.getByTestId('onboarding-bot-continue').props.accessibilityState
          .disabled
      ).toBe(false);
    });

    it('blocks Continue until review bot prefill finishes', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(
          key === 'selectedBot'
            ? JSON.stringify({
                bot_id: 'b2',
                name: 'Dragon',
                template_name: 'Blank',
                color: '#222222',
                icon: 'sparkles',
                system_prompt: 'custom prompt',
              })
            : null
        )
      );
      (fetchBots as jest.Mock).mockImplementation(
        () =>
          new Promise(() => {})
      );

      render(<OnboardingBot />);

      expect(
        screen.getByTestId('onboarding-bot-continue').props.accessibilityState
          .disabled
      ).toBe(true);
    });

    it('keeps Continue disabled when review bot prefill fails', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (fetchBots as jest.Mock).mockResolvedValue(null);

      render(<OnboardingBot />);
      await act(async () => {});

      expect(
        screen.getByTestId('onboarding-bot-continue').props.accessibilityState
          .disabled
      ).toBe(true);
    });

    it('allows review mode to recreate a missing bot after prefill completes', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        review: 'true',
        profileName: 'Maya',
        profileId: 'p2',
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [],
        count: 0,
      });

      render(<OnboardingBot />);
      await act(async () => {});

      expect(
        screen.getByTestId('onboarding-bot-continue').props.accessibilityState
          .disabled
      ).toBe(false);
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

    it('allows PIN-less continue but blocks mismatched PINs', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      // Empty PIN fields = PIN-less: Continue stays enabled with clear label.
      expect(
        screen.getByTestId('onboarding-pin-continue').props.accessibilityState
          .disabled
      ).toBe(false);
      expect(screen.getByTestId('onboarding-pinless-hint')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('onboarding-pin-input'), '1234');
      fireEvent.changeText(
        screen.getByTestId('onboarding-pin-confirm'),
        '9999'
      );
      expect(
        screen.getByTestId('onboarding-pin-continue').props.accessibilityState
          .disabled
      ).toBe(true);

      await act(async () => {
        fireEvent.changeText(
          screen.getByTestId('onboarding-pin-confirm'),
          '1234'
        );
      });

      expect(
        screen.getByTestId('onboarding-pin-continue').props.accessibilityState
          .disabled
      ).toBe(false);
    });

    it('carries a matching PIN to the notifications step', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent.changeText(screen.getByTestId('onboarding-pin-input'), '1234');
      fireEvent.changeText(
        screen.getByTestId('onboarding-pin-confirm'),
        '1234'
      );
      fireEvent.press(screen.getByTestId('onboarding-pin-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/notifications',
        params: expect.objectContaining({
          profileName: 'Maya',
          botName: 'Penelope',
          templateName: 'Blank',
          pin: '1234',
        }),
      });
    });

    it('continues PIN-less without sending a PIN', async () => {
      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent.press(screen.getByTestId('onboarding-pin-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/notifications',
        params: expect.not.objectContaining({ pin: expect.anything() }),
      });
    });

    it('preserves an explicit blank student email in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        studentEmail: '',
        profileId: 'p2',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });

      render(<OnboardingProtect />);
      await act(async () => {});

      fireEvent.press(screen.getByTestId('onboarding-pin-continue'));

      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/onboarding/notifications',
        params: expect.objectContaining({
          studentEmail: '',
          review: 'true',
          profileId: 'p2',
        }),
      });
    });

    it('goes back to the previous step', async () => {
      render(<OnboardingProtect />);

      fireEvent.press(screen.getByTestId('onboarding-back'));
      expect(mockRouter.back).toHaveBeenCalled();
    });
  });

  describe('Notifications step', () => {
    beforeEach(() => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        pin: '1234',
      });
    });

    it('bootstraps the account, selects the renamed profile and lands on chat', async () => {
      render(<OnboardingNotifications />);
      await act(async () => {});

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

    it('finishes PIN-less without sending a PIN', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.not.objectContaining({ pin: expect.anything() })
      );
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

      render(<OnboardingNotifications />);
      await act(async () => {});

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

      render(<OnboardingNotifications />);
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

      render(<OnboardingNotifications />);
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
      render(<OnboardingNotifications />);
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

      render(<OnboardingNotifications />);
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

    it('sends an explicit blank student email in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        studentEmail: '',
        profileId: 'p2',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue({
        id: 5,
        device_id: 'd1',
        notification_token: 'ExponentPushToken[test]',
        notify_on_new_chat: false,
        notify_on_new_message: false,
        notify_digest_only: false,
        deleted_at: null,
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          profileName: 'Maya',
          studentEmail: '',
          profileId: 'p2',
        })
      );
    });

    it('sends the selected profileId and botId in the review bootstrap payload', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Alex',
        profileId: 'p2',
        botName: 'Dragon',
        botId: 'b2',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue({
        id: 5,
        device_id: 'd1',
        notification_token: 'ExponentPushToken[test]',
        notify_on_new_chat: false,
        notify_on_new_message: false,
        notify_digest_only: false,
        deleted_at: null,
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      // These ids are what keep the save targeted: without them the
      // backend falls back to the oldest profile/bot rows.
      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          profileName: 'Alex',
          profileId: 'p2',
          botName: 'Dragon',
          botId: 'b2',
        })
      );
    });

    it('resolves configured rows beyond the first list page instead of selecting row one', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Zed',
        profileId: 'p9',
        botName: 'Late Bot',
        botId: 'b9',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue(null);
      (fetchProfiles as jest.Mock).mockResolvedValue({
        results: [{ profile_id: 'p1', name: 'Maya' }],
        count: 2,
      });
      (fetchProfile as jest.Mock).mockResolvedValue({
        profile_id: 'p9',
        name: 'Zed',
      });
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b1', name: 'Penelope' }],
        count: 2,
      });
      (fetchBot as jest.Mock).mockResolvedValue({
        bot_id: 'b9',
        name: 'Late Bot',
      });
      (bootstrapOnboarding as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        data: { profileId: 'p9', botId: 'b9' },
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      // Page-one misses resolve through the single-item endpoints so the
      // wizard selects exactly what it configured, not the first rows.
      expect(fetchProfile).toHaveBeenCalledWith('p9');
      expect(fetchBot).toHaveBeenCalledWith('b9');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedProfile',
        JSON.stringify({ profile_id: 'p9', name: 'Zed' })
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'selectedBot',
        JSON.stringify({ bot_id: 'b9', name: 'Late Bot' })
      );
    });

    it('leaves the prior selection intact when configured rows cannot be resolved', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Alex',
        profileId: 'p9',
        botName: 'Dragon',
        botId: 'b9',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue(null);
      (fetchProfiles as jest.Mock).mockResolvedValue({
        results: [{ profile_id: 'p1', name: 'Maya' }],
        count: 2,
      });
      (fetchProfile as jest.Mock).mockResolvedValue(null);
      (fetchBots as jest.Mock).mockResolvedValue({
        results: [{ bot_id: 'b1', name: 'Penelope' }],
        count: 2,
      });
      (fetchBot as jest.Mock).mockResolvedValue(null);
      (bootstrapOnboarding as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        data: { profileId: 'p9', botId: 'b9' },
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      // A transient failure must not cache row one over the configured
      // rows: the prior selection is left for chat to resolve.
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        'selectedProfile',
        expect.anything()
      );
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        'selectedBot',
        expect.anything()
      );
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('persists turning all notification toggles off in review mode', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue({
        id: 5,
        device_id: 'd1',
        notification_token: 'ExponentPushToken[test]',
        notify_on_new_chat: true,
        notify_on_new_message: true,
        notify_digest_only: false,
        deleted_at: null,
      });
      (upsertDevice as jest.Mock).mockResolvedValue({
        device_id: 'd1',
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      fireEvent(screen.getByTestId('onboarding-notifications-switch'), 'onValueChange', false);
      fireEvent(screen.getByTestId('onboarding-notify-message-switch'), 'onValueChange', false);

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          device_id: 'd1',
          notify_on_new_chat: false,
          notify_on_new_message: false,
          notify_digest_only: false,
        })
      );
    });

    it('does not clear review notifications when a stored device id no longer loads', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue(null);

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(registerForPushNotificationsAsync).not.toHaveBeenCalled();
      expect(fetchDeviceByToken).not.toHaveBeenCalled();
      expect(upsertDevice).not.toHaveBeenCalled();
      expect(bootstrapOnboarding).toHaveBeenCalled();
      expect(screen.getByTestId('onboarding-notification-warning').props.children).toContain(
        "couldn't load your current notification settings"
      );
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('hides the unloadable-settings warning when a toggle is on and still saves best-effort', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue(null);
      (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(
        'ExponentPushToken[test]'
      );
      (fetchDeviceByToken as jest.Mock).mockResolvedValue(null);
      (upsertDevice as jest.Mock).mockResolvedValue({
        device_id: 'd1',
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      fireEvent(screen.getByTestId('onboarding-notifications-switch'), 'onValueChange', true);

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(
        screen.queryByTestId('onboarding-notification-warning')
      ).toBeNull();
      expect(upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          notify_on_new_chat: true,
        })
      );
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('allows review completion with notifications off when no device record exists', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue(null);

      render(<OnboardingNotifications />);
      await act(async () => {});

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(bootstrapOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          profileName: 'Maya',
          botName: 'Penelope',
          templateName: 'Blank',
        })
      );
      expect(upsertDevice).not.toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
    });

    it('does not persist review notification changes when bootstrap fails', async () => {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        profileName: 'Maya',
        botName: 'Penelope',
        templateName: 'Blank',
        review: 'true',
      });
      (bootstrapOnboarding as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        data: {
          studentEmail: ['That email is already used by another profile.'],
        },
      });
      (getDeviceIdFromStorage as jest.Mock).mockResolvedValue('d1');
      (fetchDevice as jest.Mock).mockResolvedValue({
        id: 5,
        device_id: 'd1',
        notification_token: 'ExponentPushToken[test]',
        notify_on_new_chat: true,
        notify_on_new_message: true,
        notify_digest_only: false,
        deleted_at: null,
      });

      render(<OnboardingNotifications />);
      await act(async () => {});

      fireEvent(screen.getByTestId('onboarding-notifications-switch'), 'onValueChange', false);
      fireEvent(screen.getByTestId('onboarding-notify-message-switch'), 'onValueChange', false);

      await act(async () => {
        fireEvent.press(screen.getByTestId('onboarding-finish'));
      });

      expect(upsertDevice).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });
});
