import '@testing-library/jest-native/extend-expect';

process.env.EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock expo-image
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Mock useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#000000',
}));

// Mock IconSymbol component
jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: 'IconSymbol',
}));


// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

// Mock expo-audio
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestRecordingPermissions: jest.fn(),
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    uri: 'file:///cache/recording.wav',
  })),
  useAudioPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
  IOSOutputFormat: { LINEARPCM: 'lpcm', MPEG4AAC: 'aac ' },
}));

// Mock expo-file-system (legacy API used for TTS playback cache files)
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
})); 