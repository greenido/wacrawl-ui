import { defineConfig } from '@playwright/test';

// Deliberately not 3001: that is where `npm run dev` and a real archive live, and
// these tests and screenshots must never end up pointed at one.
const PORT = 3199;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: 'smoke.spec.ts' },
    // Rewrites docs/*.png; run on request with `npm run docs:screenshots`.
    { name: 'screenshots', testMatch: 'screenshots.spec.ts' },
  ],
  webServer: {
    command: 'node bin/wacrawl-dashboard.js --demo',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    // The default is SIGKILL, which would leave the demo's temp folder behind.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 3000 },
    stdout: 'pipe',
  },
});
