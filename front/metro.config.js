const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { getDefaultConfig } = require('expo/metro-config');

const config = getSentryExpoConfig(__dirname);
const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  ...config,
  // Add any custom config here
};
