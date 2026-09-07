const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000/api';
const BUNDLE_ID = 'com.tpaulshippy.botsforkids';

async function getTestTokens() {
  const response = await fetch(`${API_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e-test-user', password: 'testpassword123' }),
  });
  if (!response.ok) throw new Error(`token failed ${response.status}`);
  const data = await response.json();
  return { access: data.access, refresh: data.refresh };
}

function injectAsyncStorage(udid, tokens) {
  const containerPath = execSync(`xcrun simctl get_app_container ${udid} ${BUNDLE_ID} data`, { encoding: 'utf8' }).trim();
  const asDir = path.join(containerPath, 'Library', 'Application Support', BUNDLE_ID, 'RCTAsyncLocalStorage_V1');
  if (!fs.existsSync(asDir)) fs.mkdirSync(asDir, { recursive: true });
  const manifest = {
    tokens: JSON.stringify({ [API_BASE]: tokens }),
    e2eTestMode: 'true',
  };
  fs.writeFileSync(path.join(asDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  console.log(`Injected at ${manifestPath2(asDir)}`);
}
function manifestPath2(asDir) { return path.join(asDir, 'manifest.json'); }

describe('Smoke: inject+relaunch reproduction', () => {
  beforeAll(async () => {
    const tokens = await getTestTokens();
    await device.installApp();
    await device.launchApp({ newInstance: true });
    await new Promise((r) => setTimeout(r, 2000));
    await device.terminateApp();
    injectAsyncStorage(device.id, tokens);
    await device.launchApp({ newInstance: true });
  }, 120000);

  it('reaches chat', async () => {
    try {
      await waitFor(element(by.id('chat-input'))).toBeVisible().withTimeout(15000);
    } catch (e) {
      await device.takeScreenshot('smoke-failure-state');
      throw e;
    }
  }, 60000);
});
