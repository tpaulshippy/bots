# OTA Updates

Push a production OTA update (iOS only):

```sh
rm -rf dist && \
CI=1 EXPO_PUBLIC_API_BASE_URL=https://syftlearning.app/api \
  npx expo export --platform ios --no-bytecode --output-dir dist --clear && \
CI=1 npx eas update --branch production --environment production \
  --input-dir dist --skip-bundler --message "Summary of changes"
```

**Notes:**

- `--no-bytecode` is required because the `hermesc` binary is x86-64 and this dev machine is ARM64
- `EXPO_PUBLIC_API_BASE_URL` must be set during export so Metro bakes in the correct backend URL
- `--skip-bundler --input-dir dist` skips EAS's own bundling and uses the local export instead
