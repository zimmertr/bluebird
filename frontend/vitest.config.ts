import { defineConfig } from 'vitest/config'

// Two projects, split by file extension, so the pure suite pays nothing for the
// DOM. A `.test.ts` runs in node exactly as it always has: jsdom costs a few
// hundred milliseconds per file to stand up, and the pure suite is most of the
// files. A `.test.tsx` renders a component, so it gets jsdom and the setup file
// that unmounts between tests. The extension is the switch rather than a
// per-file pragma because a pragma forgotten on one file fails in a confusing
// way (`document is not defined`), where a wrong extension is visible in review.
//
// The timezone is pinned for both, because a calendar day is a local idea and
// some of what utils/calendar.ts guarantees only has content in a zone that
// observes DST: a local day is 23 or 25 hours across a transition, and on a UTC
// runner those assertions would pass while proving nothing. The calendar's
// component test reads the same days, so it needs the same zone.
const env = { TZ: 'America/Los_Angeles' }

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', include: ['src/**/*.test.ts'], environment: 'node', env },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['src/testSupport/setup.ts'],
          env,
        },
      },
    ],
  },
})
