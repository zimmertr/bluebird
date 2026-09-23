import { defineConfig } from '@playwright/test'

// The render probe, apart from the smoke suite: one analysis at 946
// destinations takes the client pacer minutes to fetch, which is no cost a
// pull request's CI run should pay. `make perf` runs it on request.
export default defineConfig({
  testDir: '.',
  timeout: 600_000,
  expect: { timeout: 300_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
    viewport: { width: 1280, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
