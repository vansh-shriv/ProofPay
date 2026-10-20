import { defineConfig } from '@playwright/test';

// E2E runs the real server + built UI against the offline simulators (no keys, no network, fresh DB each run).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', channel: 'chrome', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npx tsx e2e/start-server.ts',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
