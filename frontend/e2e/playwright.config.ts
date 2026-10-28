import { defineConfig } from '@playwright/test'

// Two projects, run as two invocations by `npm test`, because Playwright has no
// worker count per project. The three files in MOTION count frames and read
// layout mid-move, and under a second worker's CPU load they failed in 2 of 10
// runs at two workers and 7 to 8 of 10 at four, while every other file passed
// at four (measured 2026-10-27, run 40623715965, issue #794). So `chromium`
// runs the rest in parallel and `motion` runs those three alone after it. The
// two are joined by `&&`, so the playwright-report/ left behind is always the
// failed invocation's. No retries: a retry would hide exactly the flake this
// suite is meant to show.
const MOTION = ['**/panelMotion.spec.ts', '**/centring.spec.ts', '**/chartTap.spec.ts']
// The render probe runs on request (`make perf`), never in CI.
const PERF = 'perf/**'

export default defineConfig({
  testDir: '.',
  testIgnore: [PERF],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
    // The zone Vitest pins and the suite's isoDay counts days in.
    timezoneId: 'America/Los_Angeles',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: [PERF, ...MOTION], use: { browserName: 'chromium' } },
    { name: 'motion', testMatch: MOTION, use: { browserName: 'chromium' } },
  ],
})
