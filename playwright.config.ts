import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Capture specs (*.capture.ts) exist to produce screenshots for review and are
  // not assertions, so they are excluded from the default run.
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // This environment pins its own Chromium build; pointing at it avoids a
    // download that the sandbox blocks anyway.
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    // The agent proxy must not intercept localhost traffic.
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
})
