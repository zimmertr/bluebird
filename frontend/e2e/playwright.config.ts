import { defineConfig } from '@playwright/test'

// One worker and no retries. The suite is a few tests against one container,
// and a retry would hide exactly the flake this job is meant to show.
export default defineConfig({
  testDir: '.',
  // The render probe runs on request (`make perf`), never in CI.
  testIgnore: ['perf/**'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
