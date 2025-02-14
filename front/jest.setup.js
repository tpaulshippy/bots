import '@testing-library/jest-native/extend-expect';

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

// Mock PlatformPressable
jest.mock('@react-navigation/elements', () => ({
  PlatformPressable: 'PlatformPressable',
}));

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
})); 