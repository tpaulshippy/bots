import { NativeModules } from 'react-native';

/**
 * Check if the app is running in E2E test mode.
 * Detox launchArgs are passed as iOS NSUserDefaults / process arguments.
 */
export function isE2ETestMode(): boolean {
  try {
    const settings = NativeModules?.SettingsManager?.settings || {};
    return settings.e2eTestMode === true || settings.e2eTestMode === 'true' || settings.e2eTestMode === 1;
  } catch {
    return false;
  }
}

export const E2E_TEST_IMAGE_URI = 'https://picsum.photos/200/200';

export const E2E_MOCK_TOKENS = {
  access: 'e2e-test-access-token',
  refresh: 'e2e-test-refresh-token',
};

export const E2E_MOCK_PROFILE = {
  profile_id: 'e2e-profile-123',
  name: 'E2E Test Profile',
};

export const E2E_MOCK_BOT = {
  bot_id: 'e2e-bot-456',
  name: 'E2E Test Bot',
};
