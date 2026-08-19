import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Capture specs (*.capture.ts) exist to produce screenshots for review and are
  // not assertions, so they are excluded from the default run.
  testMatch: '**/*.spec.ts',
  // These are long integration journeys — the sign-in-through-onboarding test
  // alone is nine full navigations — driven against a dev server doing real
  // server renders. 60s was not enough once several suites ran back to back.
  timeout: 120_000,
  // Generous because every suite here drives a dev server doing full server
  // renders, and the no-JS suite makes every interaction a page navigation.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  /**
   * Retries compensate for one specific, traced dev-server flake — not for
   * flaky product code.
   *
   * Next's dev server occasionally cannot serve a page whose route is being
   * recompiled at the moment a 303 redirect lands on it, failing with
   * "Unexpected end of JSON input" or "Expected clientReferenceManifest to be
   * defined. This is a bug in Next.js." It cannot happen in a production build,
   * where nothing compiles at request time.
   *
   * This does not risk hiding a real defect: every genuine bug this suite has
   * caught failed on every single run until it was fixed. A test that passes on
   * retry has hit the compile race; a test that fails twice has found something.
   */
  retries: 2,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 20_000,
    // This environment pins its own Chromium build; pointing at it avoids a
    // download that the sandbox blocks anyway.
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    // The agent proxy must not intercept localhost traffic.
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
})
