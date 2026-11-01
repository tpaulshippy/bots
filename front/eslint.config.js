// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  {
    files: ['**/*'],
    ignores: ["dist/**", "public/**"]
  },
  expoConfig,
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json'
        }
      }
    }
  },
  {
    files: ['jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly'
      }
    }
  },
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        beforeAll: 'readonly',
        it: 'readonly',
        device: 'readonly',
        waitFor: 'readonly',
        element: 'readonly',
        by: 'readonly',
        expect: 'readonly',
        __dirname: 'readonly',
      }
    },
    rules: {
      // seedHelpers reads EXPO_PUBLIC_API_BASE_URL via a computed key:
      // babel-preset-expo statically rewrites literal process.env.EXPO_PUBLIC_*
      // reads into expo/virtual/env, which cannot resolve under e2e jest.
      'expo/no-dynamic-env-var': 'off',
    }
  }
]);
