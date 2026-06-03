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
    files: ['e2e/**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        beforeAll: 'readonly',
        it: 'readonly',
        device: 'readonly',
        waitFor: 'readonly',
        element: 'readonly',
        by: 'readonly',
      }
    }
  }
]);
